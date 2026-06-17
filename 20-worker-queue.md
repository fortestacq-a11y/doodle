# 20 — Worker & Queue System

## Purpose
Handle long-running tool executions without blocking the API.
Some tools take more than 30 seconds — they go to a background queue.

---

## When To Use Queue vs Sync

```
Synchronous (default):
  Expected duration < 10 seconds
  Examples:
    - Send email (Gmail)
    - Send Slack message
    - Create GitHub issue
    - Create Notion page
    - Any simple write operation

Async Queue:
  Expected duration > 10 seconds OR uncertain
  Examples:
    - Export all emails (could be thousands)
    - Bulk GitHub operations
    - Any operation with unknown completion time
    - Scheduled/future executions

How client chooses:
  POST /v1/tools/execute { ..., "async": true }  → queued
  POST /v1/tools/execute { ... }                 → synchronous (default)
```

---

## Queue Setup With BullMQ

```typescript
// apps/worker/src/queues/execution.queue.ts

import { Queue, Worker, QueueEvents } from 'bullmq'
import { redis } from '../lib/redis'

// Queue definition (used by API to add jobs)
export const executionQueue = new Queue('executions', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30_000, // 30 seconds initial delay
    },
    removeOnComplete: { count: 1000 },  // keep last 1000 completed
    removeOnFail: { count: 500 },       // keep last 500 failed
  },
})

// Job data shape
export interface ExecutionJobData {
  executionId: string
  workspaceId: string
  tool: string
  arguments: Record<string, unknown>
  source: string
}
```

---

## Worker Implementation

```typescript
// apps/worker/src/workers/execution.worker.ts

import { Worker, Job } from 'bullmq'
import { ExecutionEngine } from '@nexus/execution-engine'
import { prisma } from '@nexus/database'
import { logger } from '@nexus/logger'
import { redis } from '../lib/redis'
import type { ExecutionJobData } from '../queues/execution.queue'

const engine = new ExecutionEngine()

export const executionWorker = new Worker<ExecutionJobData>(
  'executions',
  async (job: Job<ExecutionJobData>) => {
    const { executionId, workspaceId, tool, arguments: args } = job.data

    logger.info({
      jobId: job.id,
      executionId,
      workspaceId,
      tool,
      attempt: job.attemptsMade + 1,
    }, 'Worker processing execution job')

    // Mark as RUNNING in DB
    await prisma.toolCall.update({
      where: { id: executionId },
      data: { status: 'RUNNING' }
    })

    const result = await engine.execute({
      workspaceId,
      tool,
      arguments: args,
      source: 'queue',
    })

    if (!result.success) {
      // BullMQ will retry based on job options
      throw new Error(`${result.error?.code}: ${result.error?.message}`)
    }

    return result
  },
  {
    connection: redis,
    concurrency: 5,  // process 5 jobs at once
    limiter: {
      max: 10,       // max 10 jobs per second
      duration: 1000,
    },
  }
)

// Event handlers
executionWorker.on('completed', (job, result) => {
  logger.info({
    jobId: job.id,
    executionId: job.data.executionId,
    durationMs: Date.now() - job.timestamp,
  }, 'Worker job completed')
})

executionWorker.on('failed', (job, error) => {
  if (!job) return

  const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 3)

  logger.error({
    jobId: job.id,
    executionId: job.data.executionId,
    attempt: job.attemptsMade,
    isFinalAttempt,
    error: error.message,
  }, 'Worker job failed')
})

executionWorker.on('error', (error) => {
  logger.error({ error: error.message }, 'Worker error')
})
```

---

## Token Refresh Worker

Proactively refresh tokens before they expire.
Prevents execution failures due to expired tokens.

```typescript
// apps/worker/src/workers/token-refresh.worker.ts

import { Worker } from 'bullmq'
import { prisma } from '@nexus/database'
import { OAuthService } from '@nexus/execution-engine'
import { logger } from '@nexus/logger'
import { redis } from '../lib/redis'

const oauthService = new OAuthService()

// Run every 30 minutes — check for tokens expiring in next hour
export async function scheduleTokenRefreshes() {
  const expiringTokens = await prisma.oAuthToken.findMany({
    where: {
      expiresAt: {
        // Expires in next 60 minutes
        lte: new Date(Date.now() + 60 * 60 * 1000),
        // But not already expired
        gte: new Date(),
      },
      refreshToken: { not: null }, // only if we have a refresh token
    },
    include: {
      connection: {
        include: { connector: true }
      }
    }
  })

  logger.info({
    count: expiringTokens.length,
  }, 'Proactive token refresh check')

  for (const token of expiringTokens) {
    try {
      await oauthService.getAccessToken(
        token.connection.workspaceId,
        token.connection.connector.name
      )
      logger.info({
        connectionId: token.connectionId,
        connector: token.connection.connector.name,
      }, 'Token proactively refreshed')
    } catch (error) {
      logger.warn({
        connectionId: token.connectionId,
        error: error instanceof Error ? error.message : 'Unknown',
      }, 'Proactive token refresh failed')
    }
  }
}
```

---

## Worker Entry Point

```typescript
// apps/worker/src/index.ts

import { executionWorker } from './workers/execution.worker'
import { scheduleTokenRefreshes } from './workers/token-refresh.worker'
import { logger } from '@nexus/logger'

async function bootstrap() {
  logger.info('Worker starting...')

  // Start execution worker
  logger.info('✓ Execution worker started (concurrency: 5)')

  // Schedule token refresh every 30 minutes
  scheduleTokenRefreshes() // run immediately
  setInterval(scheduleTokenRefreshes, 30 * 60 * 1000)

  logger.info('✓ Token refresh scheduler started (every 30 min)')
  logger.info('Worker ready')
}

bootstrap().catch((error) => {
  logger.fatal({ error: error.message }, 'Worker failed to start')
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Worker shutting down...')
  await executionWorker.close()
  process.exit(0)
})
```

---

## API Integration — Queue vs Sync Decision

```typescript
// apps/api/src/routes/executions.ts

app.post('/v1/tools/execute', {
  preHandler: [authenticate, requireWorkspace, rateLimit]
}, async (request, reply) => {
  const { tool, arguments: args, async: runAsync, idempotencyKey } = request.body as any

  if (runAsync) {
    // Create ToolCall record immediately (status: QUEUED)
    const toolRecord = await prisma.tool.findUnique({ where: { name: tool } })
    if (!toolRecord) {
      return reply.status(404).send({
        error: { code: 'TOOL_NOT_FOUND', message: `Tool not found: ${tool}` }
      })
    }

    const execution = await prisma.toolCall.create({
      data: {
        workspaceId: request.workspaceId,
        toolId: toolRecord.id,
        status: 'QUEUED',
        source: 'api',
        idempotencyKey,
      }
    })

    await prisma.toolCallInput.create({
      data: { toolCallId: execution.id, payload: args }
    })

    // Add to queue
    await executionQueue.add('execute', {
      executionId: execution.id,
      workspaceId: request.workspaceId,
      tool,
      arguments: args,
      source: 'api',
    })

    // Return immediately with executionId
    return reply.status(202).send({
      executionId: execution.id,
      status: 'QUEUED',
      pollUrl: `/v1/executions/${execution.id}`,
      message: 'Execution queued. Poll pollUrl for result.',
    })
  }

  // Synchronous execution (default for most tools)
  const result = await executionEngine.execute({
    workspaceId: request.workspaceId,
    tool,
    arguments: args ?? {},
    idempotencyKey,
    source: 'api',
  })

  return reply.status(result.success ? 200 : 400).send(result)
})
```

---

## How Client Polls For Async Result

```typescript
// Client-side polling example (for dashboards or SDKs)

async function executeAndWait(tool: string, args: Record<string, unknown>) {
  // Submit async job
  const { executionId, pollUrl } = await api.executeTool(tool, args, { async: true })

  // Poll until complete
  while (true) {
    const execution = await api.getExecution(executionId)

    if (execution.status === 'SUCCESS') {
      return execution.output
    }

    if (execution.status === 'FAILED' || execution.status === 'TIMEOUT') {
      throw new Error(`Execution failed: ${execution.errors?.[0]?.errorMessage}`)
    }

    // Still running — wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}
```

---

## BullMQ Dashboard (Optional)

View queue health in a browser:

```typescript
// apps/api/src/plugins/bull-board.ts

import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'
import { executionQueue } from '../queues/execution.queue'

export async function setupBullBoard(app: FastifyInstance) {
  const serverAdapter = new FastifyAdapter()

  createBullBoard({
    queues: [new BullMQAdapter(executionQueue)],
    serverAdapter,
  })

  serverAdapter.setBasePath('/admin/queues')
  app.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' })

  // Protect with basic auth in production
  console.log('Bull Board available at /admin/queues')
}
```

Visit `/admin/queues` to see:
- Jobs waiting, active, completed, failed
- Job details and retry controls
- Queue performance stats

---

## Queue Test Checklist

```
□ POST /v1/tools/execute with async:true → returns 202 + executionId
□ Job appears in BullMQ queue
□ Worker picks up job and executes
□ GET /v1/executions/:id returns QUEUED → RUNNING → SUCCESS
□ Failed job → retried after 30s → then 60s → then 120s
□ After 3 failed attempts → status = FAILED in DB
□ Token refresh worker runs every 30 minutes
□ Tokens expiring within 1 hour get proactively refreshed
□ Worker graceful shutdown on SIGTERM
□ Concurrency: 5 jobs run simultaneously
```
