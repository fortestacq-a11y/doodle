# 18 — AI Prompts For Building Nexus

## How To Use This Document

These are exact prompts to give to an AI coding assistant
(Claude, Cursor, GitHub Copilot) to build each part of Nexus.

Give the prompt EXACTLY as written.
Attach the relevant .md doc from this repo.
Test the output before moving to next phase.

---

## PHASE 1: Project Setup

### Prompt 1.1 — Initialize Monorepo

```
I'm building a platform called Nexus — an AI integration backend 
similar to Composio. It's a monorepo using pnpm workspaces and Turborepo.

Set up the complete monorepo structure with:
- pnpm-workspace.yaml
- turbo.json
- tsconfig.base.json
- Root package.json with these workspaces: apps/*, packages/*, connectors/*
- apps/api (Fastify, TypeScript)
- apps/dashboard (Next.js 14, TypeScript)
- apps/worker (TypeScript, BullMQ)
- packages/shared (types and constants)
- packages/database (Prisma)
- packages/encryption (AES-256-GCM)
- packages/logger (Pino)
- packages/connector-sdk
- packages/tool-registry
- packages/execution-engine
- packages/mcp-runtime
- packages/auth-sdk
- connectors/gmail
- connectors/github
- connectors/slack
- connectors/notion

Create all package.json files with correct name (@nexus/api, @nexus/database, etc.)
Each package depends on packages below it in the hierarchy.
connectors/* depend on @nexus/connector-sdk only.
Include a docker-compose.yml for local postgres and redis.
Include .env.example with all required variables.
Include .gitignore that ignores .env, node_modules, dist.

Follow the folder structure exactly as in the attached 05-folder-structure.md.
```

---

### Prompt 1.2 — Database Schema

```
Set up Prisma in the packages/database package for the Nexus platform.

Create the complete schema.prisma exactly as specified in the attached 04-database.md.

Include:
- All models: User, Session, Workspace, WorkspaceMember, ApiKey, Connector, 
  Tool, ToolVersion, Connection, OAuthToken, ToolCall, ToolCallInput, 
  ToolCallOutput, ExecutionError, Workflow, WorkflowRun, AuditLog
- All enums: Role, AuthType, ConnectionStatus, ExecutionStatus
- All relations with correct onDelete behavior
- All indexes for performance
- The database client singleton in src/index.ts
- The seed file that creates the 4 connectors: gmail, github, slack, notion
- Migration script commands in package.json

The encryption for OAuthToken is handled at the application layer, not database layer.
The fields accessToken and refreshToken store encrypted strings (format: iv:authTag:data in base64).

Generate the initial migration after setting up the schema.
```

---

### Prompt 1.3 — Encryption Package

```
Implement the encryption package for Nexus at packages/encryption.

Create src/index.ts that exports:
  encrypt(plaintext: string): string
  decrypt(ciphertext: string): string

Requirements:
- Algorithm: AES-256-GCM (authenticated encryption)
- Key: 32-byte key from ENCRYPTION_KEY environment variable (64 char hex string)
- IV: Random 12 bytes generated per encryption (96-bit for GCM)
- Storage format: base64(iv):base64(authTag):base64(encrypted) — colon separated
- decrypt() must throw if auth tag doesn't match (tampering detection)
- Both functions are synchronous
- Include a generateKey() helper that logs a random 32-byte hex key

Write tests using vitest:
- encrypt then decrypt returns original
- Same value encrypted twice gives different ciphertext (random IV)  
- Tampered ciphertext throws on decrypt
- Wrong key throws on decrypt
```

---

## PHASE 2: Auth System

### Prompt 2.1 — Fastify App Setup

```
Set up the main Fastify application for Nexus at apps/api/src/app.ts.

Include:
- Fastify instance with TypeScript types
- Register plugins: cors, helmet, sensible, rate-limit
- Register routes from all route files
- Global error handler that returns standardized error format:
  { error: { code: string, message: string } }
- Augment FastifyRequest type to include: userId, workspaceId, workspace, authType
- Health check route: GET /v1/health → { status: "ok", timestamp }
- CORS configured to allow DASHBOARD_URL from env

The global error handler must:
- Log all errors with Pino logger
- Return 400 for validation errors  
- Return the original status code for HTTP errors
- Return 500 with generic message for unknown errors (never leak stack traces)

Export a buildApp() function for testing and a main bootstrap() function.
```

---

### Prompt 2.2 — Authentication Routes

```
Build the complete authentication system for Nexus.

Based on the attached 07-auth-system.md, implement:

1. packages/auth-sdk/src/index.ts:
   - signJWT(payload): string — signs with JWT_SECRET, 7 day expiry
   - verifyJWT(token): payload — throws if invalid or expired
   - hashPassword(password): Promise<string> — bcrypt 12 rounds
   - comparePassword(password, hash): Promise<boolean>

2. apps/api/src/middlewares/authenticate.ts:
   - Prehandler that reads Authorization: Bearer <token>
   - If starts with "nx_": validate as API key
   - Otherwise: validate as JWT
   - On success: set request.userId and request.workspaceId
   - On failure: return 401 with UNAUTHORIZED code

3. apps/api/src/middlewares/rate-limit.ts:
   - 100 requests per minute per workspaceId
   - Uses Redis with key: rate_limit:{workspaceId}:{minute}
   - Returns 429 with RATE_LIMITED code when exceeded
   - Sets X-RateLimit-Limit and X-RateLimit-Remaining headers

4. apps/api/src/routes/auth.ts:
   POST /v1/auth/signup → create user, create workspace, return JWT
   POST /v1/auth/login → verify password, return JWT  
   GET /v1/auth/me → return current user + workspace (requires auth)

5. apps/api/src/routes/api-keys.ts:
   GET /v1/api-keys → list keys (show prefix, not full key)
   POST /v1/api-keys → create key, return full key ONCE
   DELETE /v1/api-keys/:id → soft delete

API key format: "nx_live_" + 32 random bytes as base64url
Store: bcrypt hash of full key, first 14 chars as keyPrefix for display

Use Zod for all request validation.
All routes return standardized JSON.
```

---

## PHASE 3: OAuth System

### Prompt 3.1 — OAuth Service

```
Build the complete OAuth system for Nexus based on attached 08-oauth-system.md.

Create apps/api/src/services/oauth.service.ts with the OAuthService class:

Methods to implement:
1. initiateConnection(workspaceId, appName):
   - Look up connector in DB
   - Create pending connection record
   - Generate random state (32 bytes hex) and store in Redis with 10 min TTL
   - Build OAuth authorization URL with all required params
   - For Google: must include access_type=offline and prompt=consent (to get refresh token)
   - Return { redirectUrl, connectionId }

2. handleCallback(provider, code, state):
   - Verify state from Redis (CSRF protection)
   - Delete state from Redis immediately (one-time use)
   - Exchange authorization code for tokens (POST to token URL)
   - Get user identifier (call provider userinfo endpoint)
   - Encrypt both tokens with @nexus/encryption
   - Store in oauth_tokens table
   - Update connection status to ACTIVE
   - Create audit log entry
   - Return { connectionId, appName, status }

3. getAccessToken(workspaceId, connectorName):
   - Find connection record
   - Throw if not connected or not ACTIVE
   - Check if token expires within 5 minutes
   - If yes: refresh using refresh_token → update DB → return new token
   - If refresh fails: update connection to REVOKED, throw error
   - Return decrypted access token (plaintext, for in-memory use only)

4. disconnect(workspaceId, connectorName):
   - Try to revoke token at provider (best effort, ignore errors)
   - Delete oauth_tokens record
   - Update connection to REVOKED

Create routes at apps/api/src/routes/oauth.ts:
   POST /v1/connections/initiate (auth required)
   GET /v1/oauth/callback/:provider (no auth — this is called by Google/GitHub)
   GET /v1/connections (auth required)
   DELETE /v1/connections/:connectorName (auth required)

The OAUTH_CONFIGS object must include configs for google, github, slack, notion.
All client IDs/secrets come from environment variables.
```

---

## PHASE 4: Tool Registry & Execution

### Prompt 4.1 — Tool Registry

```
Build the Tool Registry for Nexus based on attached 09-tool-registry.md.

Create packages/tool-registry/src/registry.ts with the ToolRegistry class:

1. registerConnector(connector: ConnectorDefinition):
   - Upsert connector record in DB
   - For each action: upsert tool record
   - For each tool: check if schema changed → create new ToolVersion if changed
   - Mark old versions as isLatest=false when creating new version
   - Invalidate Redis cache after registration
   - Log: "✓ Registered connector: gmail (6 tools)"

2. getAllTools(options?):
   - Query DB with optional filters (connectorName, category)
   - Cache in Redis for 5 minutes
   - Return formatted tool array

3. getToolsForWorkspace(workspaceId):
   - Find active connections for workspace
   - Get tools only for connected apps
   - Cache per workspace for 60 seconds
   - Return formatted tool array (empty if no connections)

4. getTool(toolName):
   - Find by exact name
   - Include connector and latest version
   - Cache 5 minutes
   - Return null if not found

5. validateToolInput(toolName, args):
   - Get tool schema
   - Check all required fields present
   - Check field types match schema
   - Check maxLength constraints
   - Return { valid, errors, tool }

6. invalidateCache(), invalidateWorkspaceCache(workspaceId)

Create routes at apps/api/src/routes/tools.ts:
   GET /v1/tools (auth required) → getToolsForWorkspace
   GET /v1/tools/:name (auth required) → getTool + 404 if not found
```

---

### Prompt 4.2 — Execution Engine

```
Build the Execution Engine for Nexus based on attached 10-execution-engine.md.

This is the most critical component. Every tool execution flows through here.

Create packages/execution-engine/src/engine.ts with the ExecutionEngine class.

The execute(request) method must do these steps IN ORDER:

1. Validate tool exists and args are correct (use ToolRegistry.validateToolInput)
   → Return VALIDATION_ERROR immediately if invalid (no DB record created)

2. Check idempotency:
   - Auto-generate key: SHA256(workspaceId + toolName + JSON.stringify(args))
   - Check Redis for this key (60 second window)
   - If found: return cached result (prevents duplicate emails on retry)

3. Check workspace exists in DB

4. Check connection is ACTIVE for this tool's connector

5. Get decrypted access token (OAuthService.getAccessToken)
   → Return AUTH_ERROR if token retrieval fails

6. Create ToolCall record (status: RUNNING) and ToolCallInput record

7. Execute with retry logic:
   - Max 3 attempts
   - 30 second timeout per attempt
   - Retry delays: 30s, 2min, 10min
   - Only retry: 429, 5xx, network errors, timeout
   - Never retry: 401, 403, 404, validation errors

8. On success:
   - Update ToolCall: status=SUCCESS, durationMs, completedAt
   - Create ToolCallOutput record
   - Store result in Redis idempotency cache (1 hour)
   - Return result with executionId

9. On failure (all retries exhausted):
   - Update ToolCall: status=FAILED
   - Create ExecutionError record with errorCode and message
   - Return error with executionId

Also create:
- packages/execution-engine/src/retry.ts (RetryHandler class)
- packages/execution-engine/src/idempotency.ts (IdempotencyChecker class)
- packages/execution-engine/src/connector-router.ts (routes to correct connector)
- packages/execution-engine/src/rate-limiter.ts (per-connector rate limits)

Create routes at apps/api/src/routes/executions.ts:
   POST /v1/tools/execute (auth required)
   GET /v1/executions (auth required) → list with pagination
   GET /v1/executions/:id (auth required) → detail, workspace isolated
```

---

## PHASE 5: Connector SDK & Connectors

### Prompt 5.1 — Connector SDK

```
Build the Connector SDK for Nexus based on attached 11-connector-sdk.md.

Create packages/connector-sdk/src/ with:

1. types.ts — All TypeScript interfaces:
   ConnectorDefinition, ActionDefinition, ExecutionContext, ActionResult, JSONSchema

2. define-connector.ts — defineConnector(config) function:
   - Validates required fields (name, displayName, actions)
   - Validates each action has name and execute function
   - Returns validated config

3. define-action.ts — defineAction(config) function:
   - Applies defaults (version: '1.0.0', category: 'general')
   - Returns config

4. http-client.ts — ConnectorHttpClient class:
   - Constructor takes (baseUrl, token)
   - Methods: get<T>, post<T>, patch<T>, delete<T>
   - All methods include Authorization: Bearer header
   - Throws structured errors: "${statusCode}: ${errorText}"
   - Returns {} for 204 No Content

5. oauth-configs.ts — OAUTH_CONFIGS object:
   - Configs for: google, github, slack, notion
   - Each has: authUrl, tokenUrl, clientId, clientSecret, redirectUri, scopes, params
   - Client IDs/secrets from process.env
   - Google must have access_type: 'offline' and prompt: 'consent' in params

Export everything from index.ts.
```

---

### Prompt 5.2 — Gmail Connector

```
Build the Gmail connector for Nexus based on attached 13-connector-gmail.md.

Create connectors/gmail/src/index.ts using @nexus/connector-sdk.

Implement these actions using defineAction():

1. SEND_EMAIL:
   - Build RFC 2822 email string with To, Subject, Cc (optional), Bcc (optional), 
     Content-Type, MIME-Version headers and body
   - Base64url encode the email
   - POST to gmail.googleapis.com/gmail/v1/users/me/messages/send
   - Return { messageId, threadId }

2. LIST_EMAILS:
   - GET messages list with maxResults (default 10, max 50) and labelIds
   - Fetch metadata for each message in parallel (From, To, Subject, Date headers)
   - Return { emails: [{id, from, to, subject, date, snippet, isUnread}], total }

3. GET_EMAIL:
   - GET message with format=full
   - Extract headers and body
   - Body extraction handles: direct, multipart text/plain, multipart text/html
   - Return { id, from, to, subject, date, body, snippet, isUnread }

4. SEARCH_EMAILS:
   - Reuse LIST_EMAILS logic with q parameter for Gmail search query

5. REPLY_EMAIL:
   - GET original message to extract From, Subject, Message-ID headers
   - Build reply with In-Reply-To and References headers
   - Send with threadId to keep in same thread

6. GET_PROFILE:
   - GET gmail.googleapis.com/gmail/v1/users/me/profile
   - Return { email, messagesTotal, threadsTotal }

RULES for every action:
- Never throw — always return ActionResult
- Set retryable: true for 5xx and 429 errors
- Set retryable: false for 4xx errors (except 429)
- Set retryable: true for network errors

Export: export const gmailConnector = defineConnector({...})
```

---

### Prompt 5.3 — GitHub, Slack, Notion Connectors

```
Build the GitHub, Slack, and Notion connectors for Nexus.
Reference the attached 14-connectors-github-slack-notion.md for exact implementation.

GitHub connector (connectors/github/src/index.ts):
Actions: LIST_REPOS, CREATE_ISSUE, LIST_ISSUES, CREATE_COMMENT
Base URL: https://api.github.com
Headers: Authorization: Bearer, Accept: application/vnd.github.v3+json
Note: GitHub tokens don't expire, no refresh needed

Slack connector (connectors/slack/src/index.ts):
Actions: SEND_MESSAGE, LIST_CHANNELS
Base URL: https://slack.com/api
Note: Slack returns ok:false in 200 responses for errors — check data.ok

Notion connector (connectors/notion/src/index.ts):
Actions: SEARCH_PAGES, CREATE_PAGE
Headers: Notion-Version: 2022-06-28
Note: Page content split by \n\n into paragraph blocks, max 2000 chars each

All connectors must:
- Use defineConnector() and defineAction() from @nexus/connector-sdk
- Never throw — always return ActionResult
- Set correct retryable flag
- Export named constant: githubConnector, slackConnector, notionConnector
```

---

## PHASE 6: MCP Runtime

### Prompt 6.1 — MCP Server

```
Build the MCP Runtime for Nexus based on attached 12-mcp-runtime.md.

Create packages/mcp-runtime/src/ with:

1. sessions.ts — SessionManager class:
   - getOrCreate(request): extracts API key from _meta.apiKey or Authorization header
   - Validates API key against database (bcrypt compare)
   - Stores session in Redis with key mcp:session:{sha256(apiKey).slice(0,32)}
   - TTL: 24 hours, refreshed on each request (sliding window)
   - Returns { id, workspaceId, createdAt, lastActivity }

2. server.ts — NexusMCPServer class:
   Uses @modelcontextprotocol/sdk

   Handle tools/list:
   - Get session from SessionManager
   - Get tools for workspace from ToolRegistry (only connected apps)
   - Format as MCP tool format: { name, description, inputSchema }
   - Return { tools: [...] }

   Handle tools/call:
   - Get session
   - Call ExecutionEngine.execute() with source: 'mcp'
   - If success: return { content: [{ type: 'text', text: JSON.stringify(data) }] }
   - If error: return same format with isError: true

3. index.ts — start() function that creates NexusMCPServer and connects stdio transport

Also add HTTP MCP endpoints to apps/api/src/routes/mcp.ts:
   POST /v1/mcp/tools/list (auth required)
   POST /v1/mcp/tools/call (auth required)

Both HTTP endpoints use the same Execution Engine as the REST API.
```

---

## PHASE 7: Frontend

### Prompt 7.1 — Next.js Dashboard

```
Build the Next.js dashboard for Nexus based on attached 16-frontend.md.

Create apps/dashboard with:

1. src/lib/api.ts — ApiClient class with all methods:
   login, signup, logout, getMe, getConnections, initiateConnection, 
   disconnect, getTools, getExecutions, getExecution, executeTool, 
   getApiKeys, createApiKey, deleteApiKey

2. app/(auth)/login/page.tsx — Login form with email/password, link to signup
3. app/(auth)/signup/page.tsx — Signup form with name/email/password, link to login

4. app/(dashboard)/layout.tsx — Sidebar with navigation:
   Overview, Connections, Tools, Executions, API Keys, Settings, Sign out

5. app/(dashboard)/connections/page.tsx — Most important page:
   - Shows 4 app cards: Gmail, GitHub, Slack, Notion
   - Each card shows: logo, name, description, available tools as badges
   - Connected: shows green status, entity ID (email/username), Disconnect button
   - Not connected: shows Connect button
   - Connect button calls initiateConnection → redirects to provider OAuth
   - After OAuth return: query param ?status=connected → refetch connections

6. app/(dashboard)/executions/page.tsx:
   - Table with columns: Tool, Status, Duration, Time, View link
   - Status badge with colors (green=success, red=failed, blue=running)
   - Polls every 5 seconds for live updates (refetchInterval)
   - Shows empty state message if no executions

7. app/(dashboard)/api-keys/page.tsx:
   - Shows key list with name, prefix (not full key), last used, created
   - Create form: name input + Create Key button
   - After creation: show full key in green alert box with copy button
   - Warn: "Copy this now — it won't be shown again"
   - Delete button per key

Use TanStack Query for all data fetching.
Use shadcn/ui components: Button, Card, Badge, Input, Table.
Use Tailwind for styling.
Protected routes redirect to /login if no token in localStorage.
```

---

## PHASE 8: Integration Testing

### Prompt 8.1 — End-to-End Test

```
Write an end-to-end test for the complete Nexus flow.

Test the following scenario:
1. Signup as new user
2. Get JWT token
3. Verify workspace was created
4. Create an API key
5. Use API key to list tools → should return empty (no connections)
6. Mock a Gmail connection directly in DB (simulate OAuth completion)
7. List tools again → Gmail tools should appear
8. Execute GMAIL_SEND_EMAIL with mock connector (don't actually send)
9. Verify execution record created with status SUCCESS
10. Get execution by ID → verify input/output stored correctly
11. List executions → verify appears in list
12. Verify another workspace cannot see this execution

For mocking the Gmail connector:
- Override the connector router to return a mock result
- Don't make real network calls in tests
- The mock returns: { success: true, data: { messageId: 'test_msg_id' } }

Also write isolation tests:
- Create User A and User B
- Create execution for User A's workspace
- User B tries to GET that execution → should get 404
- User B's execution list → should be empty

Use vitest as the test runner.
```

---

## Quick Reference: Build Order

```
1. Prompt 1.1 → Monorepo setup
2. Prompt 1.2 → Database schema
3. Prompt 1.3 → Encryption package
4. Prompt 2.1 → Fastify app setup
5. Prompt 2.2 → Authentication routes
6. Prompt 3.1 → OAuth service + routes
7. Prompt 4.1 → Tool registry
8. Prompt 4.2 → Execution engine
9. Prompt 5.1 → Connector SDK
10. Prompt 5.2 → Gmail connector
11. Prompt 5.3 → GitHub/Slack/Notion connectors
12. Prompt 6.1 → MCP runtime
13. Prompt 7.1 → Frontend dashboard
14. Prompt 8.1 → Integration tests

Test each phase before proceeding to the next.
If a phase fails its test checklist, fix it before moving on.
```
