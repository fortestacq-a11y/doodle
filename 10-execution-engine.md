# 10 — Execution Engine

## Purpose
The heart of Nexus. Turns tool calls into real actions.
Every execution flows through here. No exceptions.

---

## What It Does (In Order)

```
1. Validate tool exists and args are correct
2. Check idempotency (prevent duplicate actions)
3. Verify workspace has permission
4. Verify app is connected
5. Get OAuth token (auto-refresh if needed)
6. Log execution start
7. Invoke connector
8. Handle errors + retry if needed
9. Normalize response
10. Log result
11. Return to caller
```

---

## Full Implementation

```typescript
// packages/execution-engine/src/engine.ts

import { prisma } from '@nexus/database'
import { toolRegistry } from '@nexus/tool-registry'
import { OAuthService } from '../services/oauth.service'
import { ConnectorRouter } from './connector-router'
import { RetryHandler } from './retry'
import { IdempotencyChecker } from './idempotency'
import { logger } from '@nexus/logger'
import type { ExecutionRequest, ExecutionResult } from './types'

export class ExecutionEngine {
  private oauthService = new OAuthService()
  private connectorRouter = new ConnectorRouter()
  private retryHandler = new RetryHandler()
  private idempotency = new IdempotencyChecker()

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const { workspaceId, tool: toolName, arguments: args, idempotencyKey } = request

    // ─────────────────────────────────────────
    // STEP 1: Validate tool
    // ─────────────────────────────────────────
    const validation = await toolRegistry.validateToolInput(toolName, args)

    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.join(', '),
        }
      }
    }

    const tool = validation.tool!

    // ─────────────────────────────────────────
    // STEP 2: Check idempotency
    // Prevents duplicate emails, messages, etc
    // ─────────────────────────────────────────
    if (idempotencyKey) {
      const existing = await this.idempotency.check(idempotencyKey)
      if (existing) {
        logger.info({ idempotencyKey }, 'Returning cached result for idempotent request')
        return existing
      }
    }

    // Auto-generate idempotency key if not provided
    // This prevents duplicates on network retries
    const effectiveIdempotencyKey = idempotencyKey ??
      this.idempotency.generateKey(workspaceId, toolName, args)

    // Check auto-generated key (60 second window)
    const recentDuplicate = await this.idempotency.checkRecent(effectiveIdempotencyKey, 60)
    if (recentDuplicate) {
      logger.warn({ toolName, workspaceId }, 'Duplicate execution detected within 60s window')
      return recentDuplicate
    }

    // ─────────────────────────────────────────
    // STEP 3: Check workspace permission
    // ─────────────────────────────────────────
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    })

    if (!workspace) {
      return {
        success: false,
        error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' }
      }
    }

    // ─────────────────────────────────────────
    // STEP 4: Verify connection is active
    // ─────────────────────────────────────────
    const connector = await prisma.connector.findUnique({
      where: { name: tool.connector }
    })

    const connection = await prisma.connection.findUnique({
      where: {
        workspaceId_connectorId: {
          workspaceId,
          connectorId: connector!.id
        }
      }
    })

    if (!connection) {
      return {
        success: false,
        error: {
          code: 'CONNECTOR_NOT_CONNECTED',
          message: `${tool.connector} is not connected. Please connect it in the dashboard.`
        }
      }
    }

    if (connection.status !== 'ACTIVE') {
      return {
        success: false,
        error: {
          code: 'CONNECTOR_UNAVAILABLE',
          message: `${tool.connector} connection is ${connection.status}. Please reconnect in the dashboard.`
        }
      }
    }

    // ─────────────────────────────────────────
    // STEP 5: Get OAuth token
    // Auto-refreshes if expired
    // ─────────────────────────────────────────
    let accessToken: string
    try {
      accessToken = await this.oauthService.getAccessToken(workspaceId, tool.connector)
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get access token'
        }
      }
    }

    // ─────────────────────────────────────────
    // STEP 6: Create execution record
    // ─────────────────────────────────────────
    const toolRecord = await prisma.tool.findUnique({ where: { name: toolName } })

    const execution = await prisma.toolCall.create({
      data: {
        workspaceId,
        toolId: toolRecord!.id,
        idempotencyKey: effectiveIdempotencyKey,
        status: 'RUNNING',
        source: request.source ?? 'api',
        startedAt: new Date(),
      }
    })

    // Store input
    await prisma.toolCallInput.create({
      data: {
        toolCallId: execution.id,
        payload: args,
      }
    })

    logger.info({
      executionId: execution.id,
      workspaceId,
      tool: toolName,
    }, 'Execution started')

    const startTime = Date.now()

    // ─────────────────────────────────────────
    // STEP 7: Execute with retry logic
    // ─────────────────────────────────────────
    let result: ExecutionResult

    try {
      result = await this.retryHandler.execute(
        () => this.connectorRouter.invoke({
          connector: tool.connector,
          action: toolName,
          token: accessToken,
          args,
        }),
        {
          maxAttempts: 3,
          onRetry: async (attempt, error) => {
            logger.warn({
              executionId: execution.id,
              attempt,
              error: error.message
            }, 'Retrying execution')

            await prisma.toolCall.update({
              where: { id: execution.id },
              data: { retryCount: attempt }
            })
          }
        }
      )
    } catch (error) {
      // All retries exhausted
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorCode = this.classifyError(error)
      const durationMs = Date.now() - startTime

      // Log failure
      await prisma.toolCall.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs,
        }
      })

      await prisma.executionError.create({
        data: {
          toolCallId: execution.id,
          errorCode,
          errorMessage,
          errorDetails: error instanceof Error ? { stack: error.stack } : {},
        }
      })

      logger.error({
        executionId: execution.id,
        errorCode,
        errorMessage,
        durationMs,
      }, 'Execution failed')

      return {
        success: false,
        executionId: execution.id,
        error: { code: errorCode, message: errorMessage }
      }
    }

    // ─────────────────────────────────────────
    // STEP 8: Log success
    // ─────────────────────────────────────────
    const durationMs = Date.now() - startTime

    await prisma.toolCall.update({
      where: { id: execution.id },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        durationMs,
      }
    })

    await prisma.toolCallOutput.create({
      data: {
        toolCallId: execution.id,
        payload: result.data ?? {},
      }
    })

    // Cache idempotent result
    await this.idempotency.store(effectiveIdempotencyKey, result, 3600)

    logger.info({
      executionId: execution.id,
      durationMs,
    }, 'Execution succeeded')

    return {
      ...result,
      executionId: execution.id,
    }
  }

  // ─────────────────────────────────────────
  // Classify error type for logging + retry decisions
  // ─────────────────────────────────────────
  private classifyError(error: unknown): string {
    const message = error instanceof Error ? error.message : ''

    if (message.includes('401') || message.includes('unauthorized')) return 'AUTH_ERROR'
    if (message.includes('403') || message.includes('forbidden')) return 'PERMISSION_DENIED'
    if (message.includes('404') || message.includes('not found')) return 'NOT_FOUND'
    if (message.includes('429') || message.includes('rate limit')) return 'RATE_LIMIT'
    if (message.includes('500') || message.includes('server error')) return 'PROVIDER_ERROR'
    if (message.includes('timeout')) return 'TIMEOUT'
    if (message.includes('network') || message.includes('ECONNREFUSED')) return 'NETWORK_ERROR'

    return 'UNKNOWN_ERROR'
  }
}
```

---

## Retry Handler

```typescript
// packages/execution-engine/src/retry.ts

const RETRYABLE_ERRORS = ['RATE_LIMIT', 'PROVIDER_ERROR', 'NETWORK_ERROR', 'TIMEOUT']
const NON_RETRYABLE_ERRORS = ['VALIDATION_ERROR', 'AUTH_ERROR', 'PERMISSION_DENIED', 'NOT_FOUND']

// Retry schedule: 30s → 2min → 10min
const RETRY_DELAYS = [30_000, 120_000, 600_000]

export class RetryHandler {
  async execute<T>(
    fn: () => Promise<T>,
    options: {
      maxAttempts: number
      onRetry?: (attempt: number, error: Error) => Promise<void>
    }
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await Promise.race([
          fn(),
          this.timeout(30_000) // 30 second timeout per attempt
        ])
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if error is retryable
        const errorCode = this.classifyForRetry(lastError)
        if (NON_RETRYABLE_ERRORS.includes(errorCode)) {
          throw lastError // Don't retry — fail immediately
        }

        // Last attempt — throw
        if (attempt === options.maxAttempts) break

        // Wait before retry
        const delay = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]

        if (options.onRetry) {
          await options.onRetry(attempt, lastError)
        }

        await this.sleep(delay)
      }
    }

    throw lastError!
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout: execution exceeded ${ms}ms`)), ms)
    )
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private classifyForRetry(error: Error): string {
    const message = error.message.toLowerCase()
    if (message.includes('429') || message.includes('rate limit')) return 'RATE_LIMIT'
    if (message.includes('5') && message.includes('server')) return 'PROVIDER_ERROR'
    if (message.includes('timeout')) return 'TIMEOUT'
    if (message.includes('network') || message.includes('econnrefused')) return 'NETWORK_ERROR'
    if (message.includes('401') || message.includes('403')) return 'AUTH_ERROR'
    if (message.includes('404')) return 'NOT_FOUND'
    return 'UNKNOWN'
  }
}
```

---

## Idempotency Checker

```typescript
// packages/execution-engine/src/idempotency.ts

import { redis } from '../lib/redis'
import crypto from 'crypto'

export class IdempotencyChecker {

  // Generate deterministic key from request
  generateKey(workspaceId: string, toolName: string, args: Record<string, unknown>): string {
    const data = JSON.stringify({ workspaceId, toolName, args })
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  // Check for explicitly provided idempotency key (long-lived: 24 hours)
  async check(key: string): Promise<any | null> {
    const cached = await redis.get(`idempotency:${key}`)
    return cached ? JSON.parse(cached) : null
  }

  // Check for auto-generated key (short-lived: 60 seconds)
  // Prevents duplicates on network retries
  async checkRecent(key: string, windowSeconds: number): Promise<any | null> {
    const cached = await redis.get(`idempotency:recent:${key}`)
    return cached ? JSON.parse(cached) : null
  }

  // Store result for idempotency
  async store(key: string, result: any, ttlSeconds: number): Promise<void> {
    await redis.setex(`idempotency:${key}`, ttlSeconds, JSON.stringify(result))
    await redis.setex(`idempotency:recent:${key}`, 60, JSON.stringify(result))
  }
}
```

---

## Connector Router

```typescript
// packages/execution-engine/src/connector-router.ts

import { gmailConnector } from '@nexus/connector-gmail'
import { githubConnector } from '@nexus/connector-github'
import { slackConnector } from '@nexus/connector-slack'
import { notionConnector } from '@nexus/connector-notion'

const CONNECTORS: Record<string, any> = {
  gmail: gmailConnector,
  github: githubConnector,
  slack: slackConnector,
  notion: notionConnector,
}

export class ConnectorRouter {
  async invoke(params: {
    connector: string
    action: string
    token: string
    args: Record<string, unknown>
  }) {
    const connector = CONNECTORS[params.connector]

    if (!connector) {
      throw new Error(`Unknown connector: ${params.connector}`)
    }

    // Strip connector prefix from action name
    // GMAIL_SEND_EMAIL → SEND_EMAIL → send_email
    const actionName = params.action
      .replace(`${params.connector.toUpperCase()}_`, '')
      .toLowerCase()

    const action = connector.actions[actionName]

    if (!action) {
      throw new Error(`Unknown action: ${actionName} for connector: ${params.connector}`)
    }

    return action.execute({
      token: params.token,
      args: params.args,
    })
  }
}
```

---

## Async Execution (Long Running Jobs)

For operations that take longer than 10 seconds:

```typescript
// apps/api/src/routes/executions.ts

app.post('/v1/tools/execute', async (request, reply) => {
  const { tool, arguments: args, async: runAsync } = request.body

  if (runAsync) {
    // Queue for background processing
    const job = await executionQueue.add('execute', {
      workspaceId: request.workspaceId,
      tool,
      arguments: args,
    })

    return reply.status(202).send({
      executionId: job.id,
      status: 'QUEUED',
      message: 'Execution queued. Poll /v1/executions/:id for result.',
    })
  }

  // Synchronous execution (default)
  const result = await executionEngine.execute({
    workspaceId: request.workspaceId,
    tool,
    arguments: args,
  })

  return reply.send(result)
})

// Get execution status
app.get('/v1/executions/:id', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const execution = await prisma.toolCall.findFirst({
    where: {
      id: request.params.id,
      workspaceId: request.workspaceId  // workspace isolation
    },
    include: {
      input: true,
      output: true,
      errors: true,
      tool: true,
    }
  })

  if (!execution) {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Execution not found' }
    })
  }

  return reply.send({
    id: execution.id,
    tool: execution.tool.name,
    status: execution.status,
    durationMs: execution.durationMs,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    input: execution.input?.payload,
    output: execution.output?.payload,
    errors: execution.errors,
  })
})

// List executions for workspace
app.get('/v1/executions', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const { limit = 50, offset = 0, status, tool } = request.query

  const executions = await prisma.toolCall.findMany({
    where: {
      workspaceId: request.workspaceId,
      status: status ?? undefined,
      tool: tool ? { name: tool } : undefined,
    },
    include: { tool: true, errors: true },
    orderBy: { startedAt: 'desc' },
    take: Number(limit),
    skip: Number(offset),
  })

  return reply.send(executions.map(e => ({
    id: e.id,
    tool: e.tool.name,
    status: e.status,
    durationMs: e.durationMs,
    startedAt: e.startedAt,
    completedAt: e.completedAt,
    errorCount: e.errors.length,
  })))
})
```

---

## Per-Connector Rate Limit Tracking

```typescript
// packages/execution-engine/src/rate-limiter.ts
// Tracks rate limits PER connector to avoid getting banned

const CONNECTOR_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  gmail: { requests: 250, windowMs: 60_000 },    // Gmail: 250 quota units/min
  github: { requests: 30, windowMs: 60_000 },     // GitHub: 30 requests/min (unauthenticated)
  slack: { requests: 50, windowMs: 60_000 },       // Slack: 50 requests/min per method
  notion: { requests: 3, windowMs: 1_000 },         // Notion: 3 requests/second
}

export async function checkConnectorRateLimit(
  connector: string,
  workspaceId: string
): Promise<void> {
  const limit = CONNECTOR_LIMITS[connector]
  if (!limit) return

  const key = `connector_rl:${connector}:${workspaceId}:${Math.floor(Date.now() / limit.windowMs)}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.pexpire(key, limit.windowMs)
  }

  if (count > limit.requests) {
    const waitMs = limit.windowMs - (Date.now() % limit.windowMs)
    throw new Error(`429: Rate limit for ${connector}. Wait ${Math.ceil(waitMs / 1000)}s`)
  }
}
```

---

## Test Checklist

```
□ Execute GMAIL_SEND_EMAIL with valid args → email sent, execution logged
□ Execute with missing required arg → VALIDATION_ERROR, no execution created
□ Execute with no Gmail connection → CONNECTOR_NOT_CONNECTED error
□ Same request twice in 60s → second returns cached result (idempotency)
□ Explicit idempotency key → same result returned for 24 hours
□ Provider returns 429 → retries after 30s, then 2min, then 10min
□ Provider returns 401 → no retry, AUTH_ERROR returned
□ Execution times out at 30s → TIMEOUT error logged
□ Failed execution → error stored in execution_errors table
□ GET /v1/executions → returns workspace executions only
□ GET /v1/executions/:id → returns full detail with input/output
□ Workspace A cannot see workspace B executions
□ Gmail rate limit: 251st request in 1 min → rate limit error
```
