# 02 — Architecture

## Core Philosophy

AI never calls external APIs directly.
Nexus is the secure execution layer between AI and the world.

```
AI Agent
  ↓
Nexus
  ↓
Gmail / GitHub / Slack / Notion
```

---

## High Level Architecture

```
                        User / Developer
                               │
                    ┌──────────┴──────────┐
                    │                     │
               Dashboard              AI Agent
               (Next.js)          (Claude/GPT/etc)
                    │                     │
                    └──────────┬──────────┘
                               │
                         API Gateway
                         (Fastify)
                               │
              ┌────────────────┼────────────────┐
              │                │                │
         Auth Service    Tool Registry    Connection Service
              │                │                │
              │                └────────┬───────┘
              │                         │
              │                  Execution Engine
              │                         │
              │                  Connector Runtime
              │                         │
              │            ┌────────────┼────────────┐
              │            │            │            │
           Database      Gmail        GitHub       Slack
          (Postgres)      API          API          API
              │
           Cache
          (Redis)
```

---

## The 8 Core Systems

### 1. API Gateway
**Purpose:** Single entry point. All requests come here first.

**Responsibilities:**
- Authenticate every request (JWT or API Key)
- Rate limit per workspace
- Validate request format
- Route to correct handler
- Return standardized errors

**Technology:** Fastify + plugins

**Never does:** Business logic, executes tools, accesses database directly

---

### 2. Auth Service
**Purpose:** Who are you and what can you do?

**Responsibilities:**
- User signup / login / logout
- Workspace creation and management
- API key generation and validation
- JWT token issuance
- Session management

**Technology:** Better Auth + PostgreSQL

**Key design:** API keys are stored as bcrypt hashes. Never plaintext. Never in logs.

---

### 3. OAuth System
**Purpose:** Securely connect user accounts to external apps.

**Responsibilities:**
- Initiate OAuth flows (Gmail, GitHub, Slack, Notion)
- Handle OAuth callbacks
- Exchange auth codes for tokens
- Encrypt and store tokens
- Refresh expired tokens automatically
- Validate active connections

**Technology:** Custom OAuth service + PostgreSQL + encryption

**Key design:**
- Tokens encrypted with AES-256-GCM before storage
- Encryption key from environment variable (never in code)
- LLM context NEVER contains tokens
- Token refresh happens inside Connection Service, never in connectors

---

### 4. Tool Registry
**Purpose:** Single source of truth for what tools exist.

**Responsibilities:**
- Store tool metadata (name, description, schema)
- Store tool versions
- Handle tool discovery requests
- Filter tools by workspace permissions
- Filter tools by active connections

**Technology:** PostgreSQL + in-memory cache (Redis)

**Key design:** No service hardcodes tool definitions. Everything comes from the registry.

---

### 5. Connection Service
**Purpose:** Manage the link between a workspace and an external app.

**Responsibilities:**
- Track which workspace has which apps connected
- Retrieve OAuth tokens for execution (decrypted, in memory only)
- Validate connection status before execution
- Trigger token refresh when needed

**Technology:** PostgreSQL + Redis cache

**Key design:** Tokens are decrypted in memory and passed directly to Execution Engine. They are never returned to clients or logged.

---

### 6. Execution Engine
**Purpose:** The heart of Nexus. Turns tool calls into real actions.

**Responsibilities:**
- Validate tool exists
- Check workspace permissions
- Verify connection is active
- Retrieve OAuth token (from Connection Service)
- Build execution context
- Invoke connector
- Handle retries (with backoff)
- Handle timeouts
- Normalize response
- Log everything (input, output, duration, status)
- Generate idempotency-safe execution IDs

**Technology:** TypeScript service + BullMQ (for async jobs) + PostgreSQL

**Key design:**
- Synchronous path: fast tools (send message, create issue) < 10s
- Async path: slow tools (export data, bulk operations) via BullMQ queue
- Idempotency: each execution gets a unique ID, duplicate requests detected
- Retry schedule: 30s, 2min, 10min (only for 429/503/504/network errors)
- Never retry: 401, 403, 404, validation errors

---

### 7. Connector Runtime
**Purpose:** Provider-specific logic. Each connector knows one API.

**Responsibilities:**
- Format requests for provider's API
- Handle provider-specific auth headers
- Parse provider responses
- Normalize to Nexus standard format
- Handle provider-specific errors

**Technology:** Connector SDK (custom) + individual connector packages

**Key design:**
- Every connector implements the same interface
- Connectors never manage OAuth (tokens come from Execution Engine)
- Connectors never access the database
- Connectors never call other connectors

---

### 8. MCP Runtime
**Purpose:** Expose Nexus tools to AI systems via Model Context Protocol.

**Responsibilities:**
- Handle MCP client connections (Claude Code, Cursor, custom agents)
- Serve tool discovery (tools/list)
- Route tool calls to Execution Engine
- Manage MCP sessions (stored in Redis)
- Filter tools by workspace and active connections

**Technology:** MCP SDK + WebSocket + HTTP

**Key design:**
- MCP Runtime discovers tools — it does NOT execute them
- Execution always goes to Execution Engine
- Session stored in Redis with TTL
- Each session scoped to one workspace

---

## Request Lifecycle (Complete)

```
User: "Send email to john@gmail.com"
         │
         ▼
    LLM generates:
    { tool: "GMAIL_SEND_EMAIL", args: { to, subject, body } }
         │
         ▼
    MCP Runtime receives tool call
         │
         ▼
    API Gateway
    → Authenticate (API key / JWT)
    → Rate limit check
    → Validate request format
         │
         ▼
    Tool Registry
    → Verify GMAIL_SEND_EMAIL exists
    → Get tool schema and connector info
         │
         ▼
    Connection Service
    → Verify workspace has Gmail connected
    → Retrieve + decrypt access token
    → Check token expiry → refresh if needed
         │
         ▼
    Execution Engine
    → Build execution context
    → Generate execution ID (idempotency)
    → Log: STARTED
         │
         ▼
    Gmail Connector
    → Format Gmail API request
    → POST gmail.googleapis.com/...
    → Parse response
    → Normalize to standard format
         │
         ▼
    Execution Engine
    → Log: SUCCESS, duration, output
    → Return normalized result
         │
         ▼
    MCP Runtime → LLM → User
    "Email sent successfully ✅"
```

---

## Data Flow Rules

```
ALLOWED:
  API Gateway → any service
  Execution Engine → Connection Service (get token)
  Execution Engine → Connector Runtime (execute)
  Connector Runtime → External APIs
  MCP Runtime → Tool Registry (discover)
  MCP Runtime → Execution Engine (execute)
  Dashboard → API Gateway (all actions)

FORBIDDEN:
  Connector → Database (direct)
  Connector → OAuth tokens (direct)
  Connector → Other connectors
  MCP Runtime → Connector Runtime (bypass engine)
  LLM → External APIs (bypass Nexus)
  Any service → Raw token storage (bypass Connection Service)
```

---

## Scaling Strategy

### Stage 1 (Now — MVP)
Single deployment. Everything together.
```
Railway: API + Worker
Neon: PostgreSQL
Upstash: Redis
Vercel: Frontend
```

### Stage 2 (When needed)
Separate workers from API. Scale independently.

### Stage 3 (Much later)
Kubernetes, message queues, distributed tracing.

**Do not build Stage 2 or 3 now. Build Stage 1 that works.**
