# 15 — API Specification + Error Handling + Security

---

# PART 1: API SPECIFICATION

## Base URL
```
Development:  http://localhost:3001/v1
Production:   https://your-api.railway.app/v1
```

## Authentication
```
All endpoints (except /auth/*) require:
Authorization: Bearer <JWT_TOKEN>
or
Authorization: Bearer <API_KEY>
```

---

## Complete Endpoint List

### Auth
```
POST   /v1/auth/signup              Create account
POST   /v1/auth/login               Login
POST   /v1/auth/logout              Logout
GET    /v1/auth/me                  Get current user
```

### Workspaces
```
GET    /v1/workspaces               List user's workspaces
POST   /v1/workspaces               Create workspace
GET    /v1/workspaces/:id           Get workspace details
PATCH  /v1/workspaces/:id           Update workspace
```

### Connections (OAuth)
```
GET    /v1/connections              List connections for workspace
POST   /v1/connections/initiate     Start OAuth flow
DELETE /v1/connections/:connector   Disconnect an app
GET    /v1/connections/:connector   Get connection status
GET    /v1/oauth/callback/:provider OAuth callback (internal)
```

### Tools
```
GET    /v1/tools                    List available tools
GET    /v1/tools/:name              Get tool details + schema
```

### Executions
```
POST   /v1/tools/execute            Execute a tool
GET    /v1/executions               List executions
GET    /v1/executions/:id           Get execution detail
```

### API Keys
```
GET    /v1/api-keys                 List API keys
POST   /v1/api-keys                 Create API key
DELETE /v1/api-keys/:id             Delete API key
```

### MCP
```
POST   /v1/mcp/tools/list          MCP tools discovery
POST   /v1/mcp/tools/call          MCP tool execution
```

### Health
```
GET    /v1/health                   Health check (no auth)
```

---

## Request / Response Examples

### POST /v1/auth/signup
```json
// Request
{
  "email": "john@gmail.com",
  "password": "securepassword123",
  "name": "John Doe"
}

// Response 201
{
  "user": {
    "id": "user_abc123",
    "email": "john@gmail.com",
    "name": "John Doe"
  },
  "workspace": {
    "id": "ws_xyz789",
    "name": "John's Workspace"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### POST /v1/connections/initiate
```json
// Request
{
  "appName": "gmail"
}

// Response 200
{
  "redirectUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "connectionId": "conn_abc123"
}
```

### GET /v1/connections
```json
// Response 200
[
  {
    "id": "conn_abc123",
    "app": "gmail",
    "displayName": "Gmail",
    "status": "ACTIVE",
    "entityId": "john@gmail.com",
    "connectedAt": "2024-01-01T12:00:00Z"
  },
  {
    "id": "conn_def456",
    "app": "github",
    "displayName": "GitHub",
    "status": "ACTIVE",
    "entityId": "johndoe",
    "connectedAt": "2024-01-02T10:00:00Z"
  }
]
```

### GET /v1/tools
```json
// Response 200
[
  {
    "name": "GMAIL_SEND_EMAIL",
    "displayName": "Send Email",
    "description": "Send an email via Gmail",
    "connector": "gmail",
    "category": "communication",
    "version": "1.0.0",
    "inputSchema": {
      "type": "object",
      "properties": {
        "to": { "type": "string", "description": "Recipient email" },
        "subject": { "type": "string", "description": "Email subject" },
        "body": { "type": "string", "description": "Email body" }
      },
      "required": ["to", "subject", "body"]
    }
  }
]
```

### POST /v1/tools/execute
```json
// Request
{
  "tool": "GMAIL_SEND_EMAIL",
  "arguments": {
    "to": "john@gmail.com",
    "subject": "Hello",
    "body": "Test email from Nexus"
  }
}

// Response 200 (success)
{
  "success": true,
  "executionId": "exec_abc123",
  "data": {
    "messageId": "18abc123def",
    "threadId": "18abc123def"
  }
}

// Response 400 (error)
{
  "success": false,
  "executionId": "exec_abc123",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: subject"
  }
}
```

### GET /v1/executions
```json
// Response 200
{
  "executions": [
    {
      "id": "exec_abc123",
      "tool": "GMAIL_SEND_EMAIL",
      "status": "SUCCESS",
      "durationMs": 843,
      "startedAt": "2024-01-01T12:00:00Z",
      "completedAt": "2024-01-01T12:00:01Z"
    }
  ],
  "total": 1
}
```

### POST /v1/api-keys
```json
// Request
{
  "name": "My Agent"
}

// Response 201
{
  "id": "key_abc123",
  "name": "My Agent",
  "key": "nx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "createdAt": "2024-01-01T12:00:00Z"
}
// NOTE: key is shown ONCE and never again
```

---

# PART 2: ERROR HANDLING

## Standard Error Format
Every error returns:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## All Error Codes

### Auth Errors (4xx)
```
UNAUTHORIZED          401  No token or invalid token
FORBIDDEN             403  Valid token but no permission
INVALID_CREDENTIALS   401  Wrong email or password
TOKEN_EXPIRED         401  JWT has expired
INVALID_API_KEY       401  API key not found or invalid
```

### Request Errors (4xx)
```
VALIDATION_ERROR      400  Missing or invalid request fields
INVALID_REQUEST       400  Malformed request body
RATE_LIMITED          429  Too many requests
```

### Resource Errors (4xx)
```
WORKSPACE_NOT_FOUND   404  Workspace doesn't exist
TOOL_NOT_FOUND        404  Tool name doesn't exist
EXECUTION_NOT_FOUND   404  Execution ID doesn't exist
CONNECTOR_NOT_FOUND   404  Connector name doesn't exist
```

### Connection Errors
```
CONNECTOR_NOT_CONNECTED   400  App not connected to workspace
CONNECTOR_UNAVAILABLE     400  Connection expired or revoked
AUTH_ERROR                400  OAuth token invalid at provider
```

### Execution Errors
```
EXECUTION_FAILED      500  Tool execution failed after retries
TIMEOUT               408  Execution exceeded time limit
PROVIDER_ERROR        502  External API returned 5xx
```

### Server Errors (5xx)
```
INTERNAL_ERROR        500  Unexpected server error
```

## Global Error Handler

```typescript
// apps/api/src/errors/handler.ts

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { logger } from '@nexus/logger'

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log all errors
  logger.error({
    error: error.message,
    code: error.code,
    statusCode: error.statusCode,
    url: request.url,
    method: request.method,
    workspaceId: request.workspaceId,
  })

  // Validation errors from Zod/JSON schema
  if (error.validation) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
      }
    })
  }

  // Known status codes
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code ?? 'REQUEST_ERROR',
        message: error.message,
      }
    })
  }

  // Unknown errors — don't leak details to client
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    }
  })
}
```

---

# PART 3: SECURITY

## Encryption
```
Algorithm:    AES-256-GCM (authenticated encryption)
Key size:     256 bits (32 bytes)
IV size:      96 bits (12 bytes) — random per encryption
Auth tag:     128 bits (16 bytes)
Key source:   ENCRYPTION_KEY env variable (hex string)
Key rotation: Manual — re-encrypt all tokens with new key
              (implement rotation script before production)

What's encrypted:
  oauth_tokens.accessToken   ← always
  oauth_tokens.refreshToken  ← always
  
What's NOT encrypted (but hashed):
  api_keys.keyHash           ← bcrypt hash
  
What's plaintext (not sensitive):
  Everything else in the database
```

## Token Rules
```
1. Tokens decrypted in memory inside Connection Service only
2. Tokens NEVER logged (check all logger.info/error calls)
3. Tokens NEVER returned in API responses
4. Tokens NEVER appear in error messages
5. Tokens cleared from memory after execution completes
6. Tokens never passed to LLM context (only tool results)
```

## Workspace Isolation
```
Every database query that returns data MUST include:
  WHERE workspaceId = request.workspaceId

Never:
  prisma.toolCall.findMany()               ← returns ALL workspaces
  
Always:
  prisma.toolCall.findMany({
    where: { workspaceId: request.workspaceId }
  })

Write a test for EVERY data endpoint:
  - Login as User A (workspace A)
  - Create data in workspace A
  - Login as User B (workspace B)  
  - Try to access workspace A data → must get 404
```

## API Security Headers
```typescript
// apps/api/src/app.ts

app.addHook('onSend', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
  reply.header('X-XSS-Protection', '1; mode=block')
  reply.header('Strict-Transport-Security', 'max-age=31536000')
  reply.removeHeader('X-Powered-By')
})
```

## CORS Configuration
```typescript
// apps/api/src/app.ts

await app.register(cors, {
  origin: [
    'http://localhost:3000',           // local dashboard
    process.env.DASHBOARD_URL!,        // production dashboard
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})
```

## Input Validation (Every Route)
```typescript
// Use Zod for all request validation
import { z } from 'zod'

const executeToolSchema = z.object({
  tool: z.string().min(1).max(100),
  arguments: z.record(z.unknown()),
  idempotencyKey: z.string().max(256).optional(),
})

// In route handler:
const body = executeToolSchema.parse(request.body)
// Throws ZodError if invalid → caught by error handler → 400
```

## Audit Logging
```typescript
// Log these actions always:
const AUDITED_ACTIONS = [
  'USER_SIGNUP',
  'USER_LOGIN',
  'CONNECT_APP',
  'DISCONNECT_APP',
  'CREATE_API_KEY',
  'DELETE_API_KEY',
  'EXECUTE_TOOL',
  'WORKSPACE_MEMBER_ADDED',
  'WORKSPACE_MEMBER_REMOVED',
]

// Helper
async function auditLog(params: {
  workspaceId: string
  actorId: string
  action: string
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
  request?: FastifyRequest
}) {
  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata,
      ipAddress: params.request?.ip,
      userAgent: params.request?.headers['user-agent'],
    }
  })
}
```

## Security Test Checklist
```
□ User A cannot access User B's connections
□ User A cannot access User B's executions
□ User A cannot execute tools on User B's workspace
□ OAuth tokens never appear in API responses
□ OAuth tokens never appear in logs
□ Invalid JWT → 401 (not 500)
□ Expired JWT → 401 with clear message
□ SQL injection attempt in tool name → validation error (not DB error)
□ XSS attempt in request body → validation error
□ Rate limit: 101st request in 1 min → 429
□ API key deleted → subsequent requests with it → 401
□ CORS: request from unknown origin → blocked
```
