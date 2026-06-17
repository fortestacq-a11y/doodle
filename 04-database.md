# 04 — Database Design

## Technology
- PostgreSQL (Neon free tier)
- Prisma ORM
- All migrations via Prisma (never manual SQL in production)

---

## Core Design Principles

1. Every record belongs to a workspace (multi-tenant isolation)
2. OAuth tokens encrypted at rest (AES-256-GCM)
3. API keys stored as bcrypt hashes only
4. Every execution is fully logged (input + output + errors)
5. Idempotency keys prevent duplicate executions
6. Soft deletes where needed (audit trail)

---

## Complete Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// USERS & WORKSPACES
// ─────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String?   // null if OAuth login
  imageUrl      String?
  emailVerified Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  workspaceMembers WorkspaceMember[]
  sessions         Session[]
  auditLogs        AuditLog[]

  @@index([email])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
}

model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique  // url-safe name
  ownerId   String
  plan      String   @default("free")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members     WorkspaceMember[]
  apiKeys     ApiKey[]
  connections Connection[]
  toolCalls   ToolCall[]
  workflows   Workflow[]
  auditLogs   AuditLog[]

  @@index([ownerId])
  @@index([slug])
}

model WorkspaceMember {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  role        Role     @default(MEMBER)
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
}

enum Role {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

// ─────────────────────────────────────────
// API KEYS
// ─────────────────────────────────────────

model ApiKey {
  id          String    @id @default(cuid())
  workspaceId String
  name        String
  keyHash     String    @unique  // bcrypt hash of actual key
  keyPrefix   String              // first 8 chars: "nx_live_" — for display only
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  deletedAt   DateTime?

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([keyHash])
}

// ─────────────────────────────────────────
// CONNECTORS (app definitions — admin managed)
// ─────────────────────────────────────────

model Connector {
  id          String   @id @default(cuid())
  name        String   @unique  // "gmail"
  displayName String            // "Gmail"
  description String
  logoUrl     String?
  version     String   @default("1.0.0")
  authType    AuthType          // OAUTH2, API_KEY, BASIC
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // OAuth config (stored as JSON, contains client IDs etc from env)
  oauthConfig Json?

  tools       Tool[]
  connections Connection[]

  @@index([name])
}

enum AuthType {
  OAUTH2
  API_KEY
  BASIC
  NONE
}

// ─────────────────────────────────────────
// TOOLS (action definitions)
// ─────────────────────────────────────────

model Tool {
  id          String   @id @default(cuid())
  connectorId String
  name        String   @unique  // "GMAIL_SEND_EMAIL"
  displayName String            // "Send Email"
  description String
  category    String            // "communication", "development", etc
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  connector    Connector     @relation(fields: [connectorId], references: [id])
  versions     ToolVersion[]
  toolCalls    ToolCall[]

  @@index([connectorId])
  @@index([name])
  @@index([category])
}

model ToolVersion {
  id           String   @id @default(cuid())
  toolId       String
  version      String   @default("1.0.0")
  inputSchema  Json     // JSON Schema for input validation
  outputSchema Json     // JSON Schema for output
  isLatest     Boolean  @default(true)
  createdAt    DateTime @default(now())

  tool Tool @relation(fields: [toolId], references: [id])

  @@unique([toolId, version])
  @@index([toolId])
}

// ─────────────────────────────────────────
// CONNECTIONS (workspace → app)
// ─────────────────────────────────────────

model Connection {
  id          String           @id @default(cuid())
  workspaceId String
  connectorId String
  entityId    String           // identifier for the connected account (email, username, etc)
  status      ConnectionStatus @default(PENDING)
  connectedAt DateTime?
  updatedAt   DateTime         @updatedAt
  createdAt   DateTime         @default(now())

  workspace  Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  connector  Connector   @relation(fields: [connectorId], references: [id])
  oauthToken OAuthToken?

  @@unique([workspaceId, connectorId]) // one connection per app per workspace
  @@index([workspaceId])
  @@index([connectorId])
  @@index([status])
}

enum ConnectionStatus {
  PENDING     // OAuth initiated, not complete
  ACTIVE      // Connected and working
  EXPIRED     // Token expired, needs reconnect
  REVOKED     // User revoked access
  ERROR       // Unknown error
}

// ─────────────────────────────────────────
// OAUTH TOKENS (encrypted)
// ─────────────────────────────────────────

model OAuthToken {
  id           String    @id @default(cuid())
  connectionId String    @unique
  
  // AES-256-GCM encrypted values
  // Format: iv:authTag:encryptedData (base64)
  accessToken  String    // encrypted
  refreshToken String?   // encrypted — null for non-refreshable flows
  
  expiresAt    DateTime  // when access token expires
  scope        String    // space-separated scopes granted
  tokenType    String    @default("Bearer")
  updatedAt    DateTime  @updatedAt

  connection Connection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
}

// CRITICAL: OAuthToken fields are NEVER:
// - Returned to clients via API
// - Included in logs
// - Passed to LLM context
// They are only decrypted in memory inside Connection Service

// ─────────────────────────────────────────
// TOOL CALLS (execution history)
// ─────────────────────────────────────────

model ToolCall {
  id              String          @id @default(cuid())
  workspaceId     String
  toolId          String
  
  // Idempotency: prevents duplicate executions
  idempotencyKey  String?         @unique
  
  status          ExecutionStatus @default(QUEUED)
  source          String          @default("api") // "api", "mcp", "workflow", "agent"
  durationMs      Int?
  startedAt       DateTime        @default(now())
  completedAt     DateTime?
  retryCount      Int             @default(0)

  workspace Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tool      Tool             @relation(fields: [toolId], references: [id])
  input     ToolCallInput?
  output    ToolCallOutput?
  errors    ExecutionError[]

  @@index([workspaceId])
  @@index([toolId])
  @@index([status])
  @@index([startedAt])
  @@index([idempotencyKey])
}

enum ExecutionStatus {
  QUEUED
  RUNNING
  SUCCESS
  FAILED
  TIMEOUT
  CANCELLED
}

model ToolCallInput {
  id         String   @id @default(cuid())
  toolCallId String   @unique
  payload    Json     // the arguments passed to the tool

  toolCall ToolCall @relation(fields: [toolCallId], references: [id], onDelete: Cascade)
}

model ToolCallOutput {
  id         String   @id @default(cuid())
  toolCallId String   @unique
  payload    Json     // the result returned by the tool

  toolCall ToolCall @relation(fields: [toolCallId], references: [id], onDelete: Cascade)
}

model ExecutionError {
  id           String   @id @default(cuid())
  toolCallId   String
  errorCode    String   // "RATE_LIMIT", "PROVIDER_ERROR", etc
  errorMessage String
  errorDetails Json?    // full error object for debugging
  createdAt    DateTime @default(now())

  toolCall ToolCall @relation(fields: [toolCallId], references: [id], onDelete: Cascade)

  @@index([toolCallId])
}

// ─────────────────────────────────────────
// WORKFLOWS (future — Phase 2)
// ─────────────────────────────────────────

model Workflow {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  description String?
  definition  Json     // workflow steps as JSON
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  runs      WorkflowRun[]

  @@index([workspaceId])
}

model WorkflowRun {
  id          String          @id @default(cuid())
  workflowId  String
  status      ExecutionStatus @default(QUEUED)
  startedAt   DateTime        @default(now())
  completedAt DateTime?

  workflow Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@index([workflowId])
}

// ─────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────

model AuditLog {
  id           String   @id @default(cuid())
  workspaceId  String
  actorId      String   // user ID who performed action
  action       String   // "CONNECT_GMAIL", "DELETE_API_KEY", "EXECUTE_TOOL"
  resourceType String   // "connection", "api_key", "tool_call"
  resourceId   String?
  metadata     Json?    // additional context
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  actor     User      @relation(fields: [actorId], references: [id])

  @@index([workspaceId])
  @@index([actorId])
  @@index([action])
  @@index([createdAt])
}

// ─────────────────────────────────────────
// MCP SESSIONS
// ─────────────────────────────────────────

// MCP sessions are stored in Redis (not PostgreSQL)
// Key: mcp:session:{sessionId}
// Value: { workspaceId, createdAt, lastActivity }
// TTL: 24 hours
// Not in Prisma schema — managed by Redis directly
```

---

## Encryption Implementation

```typescript
// packages/encryption/src/index.ts

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex') // 32 bytes = 64 hex chars

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12) // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  
  const authTag = cipher.getAuthTag()
  
  // Store as: iv:authTag:encrypted (all base64)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

export function decrypt(ciphertext: string): string {
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(':')
  
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const encrypted = Buffer.from(encryptedB64, 'base64')
  
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8')
}
```

---

## Generate Encryption Key

```bash
# Run this ONCE to generate your encryption key
# Store the output in your .env as ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Index Strategy

Critical indexes already defined in schema above.

High frequency queries:
- `ToolCall` by `workspaceId` + `status` → dashboard execution list
- `Connection` by `workspaceId` → check what apps are connected
- `OAuthToken` by `connectionId` → get token before execution
- `Tool` by `name` → tool registry lookup
- `ApiKey` by `keyHash` → authentication

---

## Migration Commands

```bash
# Create initial migration
pnpm db:migrate:dev --name init

# Apply migrations in production
pnpm db:migrate:deploy

# Reset database (dev only — DESTROYS ALL DATA)
pnpm db:reset

# Open Prisma Studio (visual database browser)
pnpm db:studio
```

---

## Seed Data (Development)

```typescript
// prisma/seed.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create connectors
  await prisma.connector.createMany({
    data: [
      {
        name: 'gmail',
        displayName: 'Gmail',
        description: 'Send and receive emails via Gmail',
        authType: 'OAUTH2',
        logoUrl: '/logos/gmail.svg'
      },
      {
        name: 'github',
        displayName: 'GitHub',
        description: 'Manage repositories, issues, and pull requests',
        authType: 'OAUTH2',
        logoUrl: '/logos/github.svg'
      },
      {
        name: 'slack',
        displayName: 'Slack',
        description: 'Send messages and manage channels',
        authType: 'OAUTH2',
        logoUrl: '/logos/slack.svg'
      },
      {
        name: 'notion',
        displayName: 'Notion',
        description: 'Create and manage pages and databases',
        authType: 'OAUTH2',
        logoUrl: '/logos/notion.svg'
      }
    ],
    skipDuplicates: true
  })
  
  console.log('Seed complete')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```
