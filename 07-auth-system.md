# 07 — Auth System

## Purpose
Handle user identity, workspace management, and API key validation.
Every request to Nexus is authenticated. No exceptions.

---

## Two Authentication Methods

```
Method 1: JWT Token
  Used by: Dashboard (browser users)
  How: Login → get JWT → send in Authorization header
  Expires: 7 days

Method 2: API Key
  Used by: Developers, AI agents, MCP clients
  How: Create key in dashboard → send in Authorization header
  Expires: Never (until deleted)

Both methods go through the same middleware.
Both give access to the same workspace scope.
```

---

## User Signup Flow

```
POST /v1/auth/signup
{
  "email": "user@gmail.com",
  "password": "securepassword",
  "name": "John Doe"
}

→ Validate email format
→ Check email not already registered
→ Hash password: bcrypt(password, 12 rounds)
→ Create user record
→ Create default workspace: "John's Workspace"
→ Add user as workspace OWNER
→ Generate JWT
→ Return:
{
  "user": { "id", "email", "name" },
  "workspace": { "id", "name" },
  "token": "eyJ..."
}
```

---

## User Login Flow

```
POST /v1/auth/login
{
  "email": "user@gmail.com",
  "password": "securepassword"
}

→ Find user by email
→ Compare password: bcrypt.compare(input, hash)
→ If wrong: return 401 INVALID_CREDENTIALS
→ Generate JWT
→ Return:
{
  "user": { "id", "email", "name" },
  "token": "eyJ..."
}
```

---

## JWT Structure

```typescript
// Payload
{
  sub: "user_id",
  workspaceId: "ws_id",    // default workspace
  role: "OWNER",
  iat: 1234567890,
  exp: 1234567890 + (7 * 24 * 60 * 60)  // 7 days
}

// Sign with HS256 + JWT_SECRET from env
// Never store JWT in database — stateless
```

---

## API Key Flow

```
CREATE:
POST /v1/api-keys
{ "name": "Production Agent" }

→ Generate key:
  prefix = "nx_live_"
  random = crypto.randomBytes(32).toString('base64url')
  fullKey = prefix + random   ← shown to user ONCE, never again

→ Store:
  keyHash = bcrypt.hash(fullKey, 10)
  keyPrefix = "nx_live_" + random.slice(0, 6)  ← for display only

→ Return:
  { "key": "nx_live_xxxxx" }   ← ONLY TIME THIS IS SHOWN

VALIDATE:
→ Request comes in with: Authorization: Bearer nx_live_xxxxx
→ Detect it's API key (starts with "nx_")
→ Get all active API keys for lookup (or use keyPrefix to narrow)
→ bcrypt.compare(incomingKey, storedHash) for each
→ If match found → get workspaceId from key record
→ If no match → 401 INVALID_API_KEY
```

---

## Authentication Middleware

```typescript
// apps/api/src/middlewares/authenticate.ts

import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyJWT, hashApiKey } from '@nexus/auth-sdk'
import { prisma } from '@nexus/database'

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' }
    })
  }
  
  const token = authHeader.slice(7) // Remove "Bearer "
  
  try {
    if (token.startsWith('nx_')) {
      // API Key authentication
      const workspace = await validateApiKey(token)
      request.workspaceId = workspace.id
      request.authType = 'api_key'
    } else {
      // JWT authentication
      const payload = verifyJWT(token)
      request.userId = payload.sub
      request.workspaceId = payload.workspaceId
      request.authType = 'jwt'
    }
  } catch (error) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    })
  }
}

async function validateApiKey(key: string) {
  // Get prefix to narrow search
  const prefix = key.slice(0, 14) // "nx_live_xxxxxx"
  
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      keyPrefix: prefix,
      deletedAt: null
    },
    include: { workspace: true }
  })
  
  for (const apiKey of apiKeys) {
    const valid = await bcrypt.compare(key, apiKey.keyHash)
    if (valid) {
      // Update last used
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() }
      })
      return apiKey.workspace
    }
  }
  
  throw new Error('Invalid API key')
}
```

---

## Rate Limiting

```typescript
// apps/api/src/middlewares/rate-limit.ts

// Uses Redis to track request counts per workspace
// Window: 1 minute
// Default limit: 100 requests/minute

import { redis } from '../lib/redis'

export async function rateLimit(request, reply) {
  const workspaceId = request.workspaceId
  const key = `rate_limit:${workspaceId}:${Math.floor(Date.now() / 60000)}`
  
  const count = await redis.incr(key)
  await redis.expire(key, 60) // expire after 1 minute
  
  reply.header('X-RateLimit-Limit', 100)
  reply.header('X-RateLimit-Remaining', Math.max(0, 100 - count))
  
  if (count > 100) {
    return reply.status(429).send({
      error: { 
        code: 'RATE_LIMITED', 
        message: 'Too many requests. Limit: 100/minute' 
      }
    })
  }
}
```

---

## Workspace Middleware

```typescript
// apps/api/src/middlewares/workspace.ts
// Ensures every request has workspace context
// Validates workspace exists and is active

export async function requireWorkspace(request, reply) {
  if (!request.workspaceId) {
    return reply.status(400).send({
      error: { code: 'WORKSPACE_REQUIRED', message: 'No workspace context' }
    })
  }
  
  const workspace = await prisma.workspace.findUnique({
    where: { id: request.workspaceId }
  })
  
  if (!workspace) {
    return reply.status(404).send({
      error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' }
    })
  }
  
  request.workspace = workspace
}
```

---

## Auth Routes

```typescript
// apps/api/src/routes/auth.ts

app.post('/v1/auth/signup', signupHandler)
app.post('/v1/auth/login', loginHandler)
app.post('/v1/auth/logout', { preHandler: authenticate }, logoutHandler)
app.get('/v1/auth/me', { preHandler: authenticate }, getMeHandler)

// Workspace routes
app.get('/v1/workspaces', { preHandler: authenticate }, listWorkspacesHandler)
app.post('/v1/workspaces', { preHandler: authenticate }, createWorkspaceHandler)

// API Key routes
app.get('/v1/api-keys', { preHandler: [authenticate, requireWorkspace] }, listApiKeysHandler)
app.post('/v1/api-keys', { preHandler: [authenticate, requireWorkspace] }, createApiKeyHandler)
app.delete('/v1/api-keys/:id', { preHandler: [authenticate, requireWorkspace] }, deleteApiKeyHandler)
```

---

## Security Rules

```
1. Passwords: bcrypt with 12 rounds minimum
2. JWT: signed with HS256, 7-day expiry
3. API Keys: bcrypt hashed, shown once, never stored plaintext
4. Rate limit: per workspace, not per IP
5. All auth failures: return 401 with generic message
   (never reveal if email exists or password is wrong separately)
6. HTTPS only in production
7. No sensitive data in JWT payload (no passwords, no tokens)
```

---

## Test Checklist

```
□ Signup with valid data → returns user + token
□ Signup with existing email → returns 409
□ Login with correct password → returns token
□ Login with wrong password → returns 401
□ Request with valid JWT → authenticated
□ Request with expired JWT → 401
□ Request with valid API key → authenticated
□ Request with invalid API key → 401
□ Request with no token → 401
□ Rate limit: 101st request → 429
□ Workspace isolation: user A cannot access workspace B data
```
