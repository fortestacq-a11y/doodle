# 17 — Testing & Deployment

---

# PART 1: TESTING

## Testing Strategy

```
Unit Tests:       Each function in isolation
Integration Tests: Services working together
E2E Tests:        Full flow from API to external service
Manual Tests:     Checklist per feature
```

## Test Setup

```typescript
// packages/database/src/test-client.ts
// Use a separate test database — NEVER test on production DB

import { PrismaClient } from '@prisma/client'

export const testPrisma = new PrismaClient({
  datasources: {
    db: { url: process.env.TEST_DATABASE_URL }
  }
})

// Clear database between tests
export async function clearDatabase() {
  await testPrisma.auditLog.deleteMany()
  await testPrisma.toolCallOutput.deleteMany()
  await testPrisma.toolCallInput.deleteMany()
  await testPrisma.executionError.deleteMany()
  await testPrisma.toolCall.deleteMany()
  await testPrisma.oAuthToken.deleteMany()
  await testPrisma.connection.deleteMany()
  await testPrisma.apiKey.deleteMany()
  await testPrisma.workspaceMember.deleteMany()
  await testPrisma.workspace.deleteMany()
  await testPrisma.session.deleteMany()
  await testPrisma.user.deleteMany()
}
```

## Auth Tests

```typescript
// apps/api/src/tests/auth.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app'
import { clearDatabase } from '@nexus/database/test-client'

describe('Auth', () => {
  const app = buildApp()

  beforeEach(async () => {
    await clearDatabase()
  })

  it('signup creates user and workspace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      body: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user.email).toBe('test@example.com')
    expect(body.workspace).toBeDefined()
    expect(body.token).toBeDefined()
  })

  it('signup with existing email returns 409', async () => {
    // Create user first
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      body: { email: 'test@example.com', password: 'password123', name: 'Test' },
    })

    // Try again
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      body: { email: 'test@example.com', password: 'password456', name: 'Test 2' },
    })

    expect(res.statusCode).toBe(409)
  })

  it('login with wrong password returns 401', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      body: { email: 'test@example.com', password: 'correct', name: 'Test' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      body: { email: 'test@example.com', password: 'wrong' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('protected route without token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/connections',
    })
    expect(res.statusCode).toBe(401)
  })
})
```

## Workspace Isolation Tests

```typescript
// apps/api/src/tests/isolation.test.ts

describe('Workspace Isolation', () => {
  it('user cannot see another workspace executions', async () => {
    // Create User A with workspace A
    const userA = await signupAndGetToken('a@test.com', 'passA', 'User A')

    // Create execution in workspace A
    // (mock execution directly in DB for simplicity)
    await createMockExecution(userA.workspaceId)

    // Create User B with workspace B
    const userB = await signupAndGetToken('b@test.com', 'passB', 'User B')

    // User B tries to get executions
    const res = await app.inject({
      method: 'GET',
      url: '/v1/executions',
      headers: { Authorization: `Bearer ${userB.token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Should return empty — not User A's executions
    expect(body.executions).toHaveLength(0)
  })

  it('user cannot get another workspace execution by ID', async () => {
    const userA = await signupAndGetToken('a@test.com', 'passA', 'User A')
    const execution = await createMockExecution(userA.workspaceId)

    const userB = await signupAndGetToken('b@test.com', 'passB', 'User B')

    const res = await app.inject({
      method: 'GET',
      url: `/v1/executions/${execution.id}`,
      headers: { Authorization: `Bearer ${userB.token}` },
    })

    // Should be 404, not 200 with User A's data
    expect(res.statusCode).toBe(404)
  })
})
```

## Encryption Tests

```typescript
// packages/encryption/src/encryption.test.ts

describe('Encryption', () => {
  it('encrypt and decrypt returns original value', () => {
    const original = 'ya29.some_secret_token'
    const encrypted = encrypt(original)
    const decrypted = decrypt(encrypted)
    expect(decrypted).toBe(original)
  })

  it('encrypted value is different from original', () => {
    const original = 'ya29.some_secret_token'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
  })

  it('same value encrypted twice gives different result (random IV)', () => {
    const value = 'same_token'
    const enc1 = encrypt(value)
    const enc2 = encrypt(value)
    expect(enc1).not.toBe(enc2)  // Different IV each time
    // But both decrypt to same value
    expect(decrypt(enc1)).toBe(value)
    expect(decrypt(enc2)).toBe(value)
  })

  it('tampered ciphertext throws on decrypt', () => {
    const encrypted = encrypt('secret')
    const tampered = encrypted.slice(0, -5) + 'XXXXX'
    expect(() => decrypt(tampered)).toThrow()
  })
})
```

## Execution Engine Tests

```typescript
// packages/execution-engine/src/engine.test.ts

describe('Execution Engine', () => {
  it('returns VALIDATION_ERROR for missing required field', async () => {
    const result = await engine.execute({
      workspaceId: 'ws_test',
      tool: 'GMAIL_SEND_EMAIL',
      arguments: { to: 'john@test.com' }, // missing subject and body
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns CONNECTOR_NOT_CONNECTED when Gmail not connected', async () => {
    const result = await engine.execute({
      workspaceId: 'ws_test_no_connections',
      tool: 'GMAIL_SEND_EMAIL',
      arguments: { to: 'j@t.com', subject: 'Hi', body: 'Test' },
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('CONNECTOR_NOT_CONNECTED')
  })

  it('idempotency: same request in 60s returns same result', async () => {
    const key = 'test_idempotency_key_123'

    const result1 = await engine.execute({
      workspaceId: 'ws_test',
      tool: 'GMAIL_SEND_EMAIL',
      arguments: { to: 'j@t.com', subject: 'Hi', body: 'Test' },
      idempotencyKey: key,
    })

    const result2 = await engine.execute({
      workspaceId: 'ws_test',
      tool: 'GMAIL_SEND_EMAIL',
      arguments: { to: 'j@t.com', subject: 'Hi', body: 'Test' },
      idempotencyKey: key,
    })

    // Second call should return same result without executing again
    expect(result2.executionId).toBe(result1.executionId)
  })
})
```

---

# PART 2: DEPLOYMENT

## Services

```
Frontend:   Vercel          (free)
Backend:    Railway         (free $5 credit)
Database:   Neon            (free tier)
Redis:      Upstash         (free tier)
```

## Step 1 — Setup Neon Database

```bash
1. Go to neon.tech → Create account → Create project
2. Name: "nexus"
3. Copy connection string:
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/nexus?sslmode=require
4. Save as DATABASE_URL in Railway
```

## Step 2 — Setup Upstash Redis

```bash
1. Go to upstash.com → Create account → Create database
2. Name: "nexus"
3. Region: same as your Neon region
4. Copy Redis URL:
   rediss://default:xxx@global-proven-xxx.upstash.io:6379
5. Save as REDIS_URL in Railway
```

## Step 3 — Deploy Backend to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway new nexus-api

# Link to your repo
railway link

# Set environment variables
railway variables set NODE_ENV=production
railway variables set DATABASE_URL="postgresql://..."
railway variables set REDIS_URL="rediss://..."
railway variables set JWT_SECRET="your_generated_secret"
railway variables set ENCRYPTION_KEY="your_generated_key"
railway variables set GOOGLE_CLIENT_ID="..."
railway variables set GOOGLE_CLIENT_SECRET="..."
railway variables set GOOGLE_REDIRECT_URI="https://your-api.railway.app/v1/oauth/callback/google"
railway variables set GITHUB_CLIENT_ID="..."
railway variables set GITHUB_CLIENT_SECRET="..."
railway variables set GITHUB_REDIRECT_URI="https://your-api.railway.app/v1/oauth/callback/github"
railway variables set SLACK_CLIENT_ID="..."
railway variables set SLACK_CLIENT_SECRET="..."
railway variables set SLACK_REDIRECT_URI="https://your-api.railway.app/v1/oauth/callback/slack"
railway variables set NOTION_CLIENT_ID="..."
railway variables set NOTION_CLIENT_SECRET="..."
railway variables set NOTION_REDIRECT_URI="https://your-api.railway.app/v1/oauth/callback/notion"
railway variables set DASHBOARD_URL="https://your-dashboard.vercel.app"

# Deploy
railway up
```

## Step 4 — Run Database Migrations on Railway

```bash
# After deploy, run migrations
railway run pnpm db:migrate:deploy
railway run pnpm db:seed
```

## Step 5 — Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from dashboard directory
cd apps/dashboard
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL
# Enter: https://your-api.railway.app
```

## Step 6 — Update OAuth Redirect URIs

After deploying, update all OAuth app configurations:

```
Google Cloud Console:
  Add: https://your-api.railway.app/v1/oauth/callback/google

GitHub OAuth App:
  Add: https://your-api.railway.app/v1/oauth/callback/github

Slack App:
  Add: https://your-api.railway.app/v1/oauth/callback/slack

Notion Integration:
  Add: https://your-api.railway.app/v1/oauth/callback/notion
```

## Step 7 — Verify Deployment

```bash
# Health check
curl https://your-api.railway.app/v1/health
# Should return: {"status":"ok"}

# Test auth
curl -X POST https://your-api.railway.app/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@gmail.com","password":"test123","name":"You"}'

# Test connections page
open https://your-dashboard.vercel.app
```

## Dockerfile (For Railway)

```dockerfile
# apps/api/Dockerfile

FROM node:20-alpine AS base
RUN npm install -g pnpm turbo

FROM base AS installer
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM installer AS builder
RUN turbo build --filter=api

FROM base AS runner
WORKDIR /app
COPY --from=installer /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=installer /app/packages ./packages
COPY --from=installer /app/package.json ./

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
```

## railway.toml

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "apps/api/Dockerfile"

[deploy]
startCommand = "node apps/api/dist/index.js"
healthcheckPath = "/v1/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

## Production Checklist

```
Before sharing with friends:

Infrastructure:
□ DATABASE_URL pointing to Neon production
□ REDIS_URL pointing to Upstash production
□ ENCRYPTION_KEY set (never change after first user connects)
□ JWT_SECRET set (changing this logs everyone out)
□ All OAuth credentials set and tested
□ All OAuth redirect URIs updated to production URLs

Security:
□ No .env file committed to git
□ .gitignore includes .env
□ HTTPS enforced (Railway does this automatically)
□ CORS allows only your dashboard URL

Testing:
□ Health check returns OK
□ Signup flow works
□ Gmail OAuth flow completes
□ Tool execution works (send a test email)
□ Execution appears in dashboard

Friends:
□ Share dashboard URL
□ Create their accounts OR have them sign up
□ Walk through connecting Gmail
□ Show them how to get an API key for MCP
```

## Monitoring (Free)

```
Railway Dashboard:
  - CPU and memory usage
  - Request logs
  - Deployment history

Neon Dashboard:
  - Database connections
  - Query performance
  - Storage usage

Upstash Dashboard:
  - Redis commands/sec
  - Memory usage
  - Cache hit rate

Add to your API (free):
  console.log() → appears in Railway logs
  
For errors, wrap your main handler:
  process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT_EXCEPTION', error)
  })
```
