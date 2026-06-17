# 19 — Observability & Logging

## Purpose
Know what's happening inside Nexus at all times.
When something breaks — find it in under 5 minutes.

---

## The Three Things You Need

```
1. Logs      — What happened, when, and why
2. Metrics   — How the system is performing (counts, rates, durations)
3. Alerts    — Get notified when something goes wrong
```

---

## Logger Setup (Pino)

```typescript
// packages/logger/src/index.ts

import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),

  // Pretty print in development only
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  // Standard fields on every log
  base: {
    service: 'nexus-api',
    version: process.env.npm_package_version,
    env: process.env.NODE_ENV,
  },

  // Redact sensitive fields — NEVER log these
  redact: {
    paths: [
      'accessToken',
      'refreshToken',
      'token',
      'password',
      'passwordHash',
      'keyHash',
      '*.accessToken',
      '*.refreshToken',
      '*.token',
      '*.password',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
})

// Child logger factory — adds context to all logs in a request
export function createRequestLogger(requestId: string, workspaceId?: string) {
  return logger.child({ requestId, workspaceId })
}
```

---

## What To Log And Where

### API Gateway — Log Every Request

```typescript
// apps/api/src/app.ts

app.addHook('onRequest', async (request) => {
  request.log.info({
    method: request.method,
    url: request.url,
    workspaceId: request.workspaceId,
  }, 'Request received')
})

app.addHook('onResponse', async (request, reply) => {
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    durationMs: reply.elapsedTime,
    workspaceId: request.workspaceId,
  }, 'Request completed')
})
```

### OAuth System — Log Connection Events

```typescript
// In OAuthService

logger.info({
  workspaceId,
  appName,
  connectionId,
}, 'OAuth connection initiated')

logger.info({
  workspaceId,
  appName,
  connectionId,
  entityId,
}, 'OAuth connection completed')

logger.warn({
  connectionId,
  connectorName,
  reason: 'Token expired, refreshing',
}, 'OAuth token refresh triggered')

logger.error({
  connectionId,
  connectorName,
  error: error.message,  // message only, never the token
}, 'OAuth token refresh failed — connection revoked')
```

### Execution Engine — Log Every Execution

```typescript
// In ExecutionEngine.execute()

// On start
logger.info({
  executionId: execution.id,
  workspaceId,
  tool: toolName,
  source: request.source,
}, 'Execution started')

// On retry
logger.warn({
  executionId: execution.id,
  attempt,
  errorCode,
  errorMessage,
  nextRetryIn: `${delay}ms`,
}, 'Execution retry scheduled')

// On success
logger.info({
  executionId: execution.id,
  tool: toolName,
  durationMs,
  workspaceId,
}, 'Execution succeeded')

// On failure
logger.error({
  executionId: execution.id,
  tool: toolName,
  errorCode,
  errorMessage,
  retryCount,
  durationMs,
  workspaceId,
}, 'Execution failed')
```

### Tool Registry — Log Registration

```typescript
logger.info({
  connector: connector.name,
  toolCount: connector.actions.length,
  tools: connector.actions.map(a => a.name),
}, 'Connector registered')
```

---

## Log Levels — When To Use Each

```
logger.debug()   Development only. Request details, cache hits, etc.
                 Example: "Cache hit for workspace tools"

logger.info()    Normal operations. Start, complete, connect events.
                 Example: "Execution started", "OAuth completed"

logger.warn()    Something unexpected but not broken.
                 Example: "Token expiring soon, refreshing", "Retry attempt 2"

logger.error()   Something broke. Needs investigation.
                 Example: "Execution failed after 3 retries", "DB connection error"

logger.fatal()   System cannot continue. Immediate action needed.
                 Example: "Cannot connect to database on startup"
```

---

## Structured Log Format

Every log entry is JSON in production:

```json
{
  "level": "info",
  "time": 1704067200000,
  "service": "nexus-api",
  "env": "production",
  "executionId": "exec_abc123",
  "workspaceId": "ws_xyz789",
  "tool": "GMAIL_SEND_EMAIL",
  "durationMs": 843,
  "msg": "Execution succeeded"
}
```

This format lets you filter in Railway logs:
- All errors: `level:error`
- One workspace: `workspaceId:ws_xyz789`
- One tool: `tool:GMAIL_SEND_EMAIL`
- Slow executions: `durationMs` > 3000

---

## Key Metrics To Track

Track these manually in the DB — no external service needed for MVP:

```typescript
// Query these for your dashboard overview page

// 1. Total executions today
const today = new Date()
today.setHours(0, 0, 0, 0)

const totalToday = await prisma.toolCall.count({
  where: {
    workspaceId,
    startedAt: { gte: today }
  }
})

// 2. Success rate last 7 days
const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

const [success, total] = await Promise.all([
  prisma.toolCall.count({
    where: { workspaceId, status: 'SUCCESS', startedAt: { gte: last7days } }
  }),
  prisma.toolCall.count({
    where: { workspaceId, startedAt: { gte: last7days } }
  })
])

const successRate = total > 0 ? (success / total * 100).toFixed(1) : '100'

// 3. Most used tools
const topTools = await prisma.toolCall.groupBy({
  by: ['toolId'],
  where: { workspaceId, startedAt: { gte: last7days } },
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } },
  take: 5,
})

// 4. Average duration per connector
const avgDuration = await prisma.toolCall.aggregate({
  where: { workspaceId, status: 'SUCCESS', startedAt: { gte: last7days } },
  _avg: { durationMs: true }
})

// 5. Active connections count
const activeConnections = await prisma.connection.count({
  where: { workspaceId, status: 'ACTIVE' }
})
```

---

## Overview Dashboard Stats

```tsx
// apps/dashboard/src/app/(dashboard)/page.tsx

export default async function OverviewPage() {
  const stats = await api.getStats() // GET /v1/stats

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Executions Today"
          value={stats.executionsToday}
          icon="⚡"
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          icon="✅"
        />
        <StatCard
          title="Connected Apps"
          value={stats.activeConnections}
          icon="🔗"
        />
        <StatCard
          title="Available Tools"
          value={stats.toolCount}
          icon="🔧"
        />
      </div>

      {/* Recent executions */}
      <RecentExecutions />
    </div>
  )
}
```

---

## Stats API Endpoint

```typescript
// apps/api/src/routes/stats.ts

app.get('/v1/stats', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const workspaceId = request.workspaceId
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    executionsToday,
    successLast7days,
    totalLast7days,
    activeConnections,
    toolCount,
    recentExecutions,
  ] = await Promise.all([
    prisma.toolCall.count({ where: { workspaceId, startedAt: { gte: today } } }),
    prisma.toolCall.count({ where: { workspaceId, status: 'SUCCESS', startedAt: { gte: last7days } } }),
    prisma.toolCall.count({ where: { workspaceId, startedAt: { gte: last7days } } }),
    prisma.connection.count({ where: { workspaceId, status: 'ACTIVE' } }),
    toolRegistry.getToolsForWorkspace(workspaceId).then(t => t.length),
    prisma.toolCall.findMany({
      where: { workspaceId },
      include: { tool: true },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
  ])

  return reply.send({
    executionsToday,
    successRate: totalLast7days > 0
      ? Number((successLast7days / totalLast7days * 100).toFixed(1))
      : 100,
    activeConnections,
    toolCount,
    recentExecutions: recentExecutions.map(e => ({
      id: e.id,
      tool: e.tool.name,
      status: e.status,
      durationMs: e.durationMs,
      startedAt: e.startedAt,
    })),
  })
})
```

---

## Error Alerting (Simple Version)

No Sentry needed for MVP. Use this pattern:

```typescript
// packages/logger/src/alerts.ts

// Log errors to a dedicated channel
// In production: watch Railway logs for "level":"error"
// For friends demo: this is enough

export async function alertError(params: {
  title: string
  error: Error
  context?: Record<string, unknown>
}) {
  logger.error({
    alert: true,  // filter by this in logs
    title: params.title,
    error: params.error.message,
    stack: params.error.stack,
    ...params.context,
  }, `ALERT: ${params.title}`)

  // Later: add webhook to Slack, Discord, or email
  // if (process.env.ALERT_WEBHOOK_URL) {
  //   await fetch(process.env.ALERT_WEBHOOK_URL, {
  //     method: 'POST',
  //     body: JSON.stringify({ text: `🚨 ${params.title}: ${params.error.message}` })
  //   })
  // }
}
```

Trigger alerts for:
```typescript
// OAuth token refresh failures
await alertError({
  title: 'OAuth token refresh failed',
  error,
  context: { connectionId, connectorName, workspaceId }
})

// Execution engine unexpected errors
await alertError({
  title: 'Unexpected execution engine error',
  error,
  context: { executionId, toolName, workspaceId }
})

// Database connection failures
await alertError({
  title: 'Database connection failed',
  error,
})
```

---

## Health Check Endpoint

```typescript
// apps/api/src/routes/health.ts

app.get('/v1/health', async (request, reply) => {
  const checks = {
    api: 'ok',
    database: 'unknown',
    redis: 'unknown',
  }

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  // Check Redis
  try {
    await redis.ping()
    checks.redis = 'ok'
  } catch {
    checks.redis = 'error'
  }

  const allOk = Object.values(checks).every(v => v === 'ok')

  return reply
    .status(allOk ? 200 : 503)
    .send({
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
    })
})
```

---

## Log Checklist

```
□ No OAuth tokens appear anywhere in logs
□ No passwords appear in logs
□ No API keys appear in logs (only prefixes)
□ Every execution has executionId in all related logs
□ Every request has workspaceId in logs
□ Errors include enough context to debug without guessing
□ Pino redact config covers all sensitive field names
□ Health check returns 200 when all systems up
□ Health check returns 503 when DB or Redis is down
```
