# 12 — MCP Runtime

## Purpose
Expose Nexus tools to AI systems via Model Context Protocol.
Any MCP client — Claude Code, Cursor, custom agents — can discover
and execute tools without knowing anything about OAuth or connectors.

---

## What MCP Runtime Does vs Does NOT Do

```
DOES:
  - Accept MCP client connections
  - Serve tool list (tools/list)
  - Route tool calls to Execution Engine
  - Manage sessions in Redis
  - Filter tools by workspace + active connections

DOES NOT:
  - Execute tools directly
  - Access OAuth tokens
  - Call connectors
  - Store anything in PostgreSQL
```

---

## MCP Session Design

Sessions stored in Redis (not PostgreSQL — they're ephemeral).

```
Key:   mcp:session:{sessionId}
Value: {
  workspaceId: "ws_123",
  createdAt: "2024-01-01T00:00:00Z",
  lastActivity: "2024-01-01T00:05:00Z",
  clientInfo: {
    name: "claude-code",
    version: "1.0.0"
  }
}
TTL: 24 hours
Refreshed: on every request (sliding window)
```

---

## Full MCP Server Implementation

```typescript
// packages/mcp-runtime/src/server.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { toolRegistry } from '@nexus/tool-registry'
import { ExecutionEngine } from '@nexus/execution-engine'
import { SessionManager } from './sessions'
import { logger } from '@nexus/logger'

export class NexusMCPServer {
  private server: Server
  private sessionManager: SessionManager
  private executionEngine: ExecutionEngine

  constructor() {
    this.server = new Server(
      { name: 'nexus', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )
    this.sessionManager = new SessionManager()
    this.executionEngine = new ExecutionEngine()

    this.setupHandlers()
  }

  private setupHandlers() {
    // ─────────────────────────────────────────
    // tools/list — AI asks what tools exist
    // ─────────────────────────────────────────
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      const session = await this.sessionManager.getOrCreate(request)
      if (!session) {
        throw new Error('UNAUTHORIZED: No valid session. Provide API key.')
      }

      // Get tools for this workspace (only connected apps)
      const tools = await toolRegistry.getToolsForWorkspace(session.workspaceId)

      // Format for MCP protocol
      const mcpTools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: tool.inputSchema.properties ?? {},
          required: tool.inputSchema.required ?? [],
        }
      }))

      logger.info({
        workspaceId: session.workspaceId,
        toolCount: mcpTools.length,
      }, 'MCP tools/list served')

      return { tools: mcpTools }
    })

    // ─────────────────────────────────────────
    // tools/call — AI wants to execute a tool
    // ─────────────────────────────────────────
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const session = await this.sessionManager.getOrCreate(request)
      if (!session) {
        return {
          content: [{
            type: 'text',
            text: 'ERROR: Unauthorized. No valid session.'
          }],
          isError: true,
        }
      }

      const { name: toolName, arguments: args } = request.params

      logger.info({
        workspaceId: session.workspaceId,
        tool: toolName,
      }, 'MCP tool call received')

      // Route to Execution Engine — never execute directly
      const result = await this.executionEngine.execute({
        workspaceId: session.workspaceId,
        tool: toolName,
        arguments: args ?? {},
        source: 'mcp',
      })

      // Format result for MCP
      if (result.success) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data, null, 2)
          }]
        }
      } else {
        return {
          content: [{
            type: 'text',
            text: `ERROR: ${result.error?.code}: ${result.error?.message}`
          }],
          isError: true,
        }
      }
    })
  }

  async start() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    logger.info('MCP server started (stdio)')
  }
}
```

---

## Session Manager

```typescript
// packages/mcp-runtime/src/sessions.ts

import { redis } from '../lib/redis'
import { prisma } from '@nexus/database'
import crypto from 'crypto'
import bcrypt from 'bcrypt'

const SESSION_TTL = 86400 // 24 hours

export interface MCPSession {
  id: string
  workspaceId: string
  createdAt: string
  lastActivity: string
}

export class SessionManager {

  async getOrCreate(request: any): Promise<MCPSession | null> {
    // Extract API key from request headers or params
    const apiKey = this.extractApiKey(request)
    if (!apiKey) return null

    // Check session cache first
    const sessionId = this.hashForSessionKey(apiKey)
    const cached = await redis.get(`mcp:session:${sessionId}`)

    if (cached) {
      const session = JSON.parse(cached)
      // Refresh TTL (sliding window)
      session.lastActivity = new Date().toISOString()
      await redis.setex(`mcp:session:${sessionId}`, SESSION_TTL, JSON.stringify(session))
      return session
    }

    // Validate API key against database
    const workspace = await this.validateApiKey(apiKey)
    if (!workspace) return null

    // Create new session
    const session: MCPSession = {
      id: sessionId,
      workspaceId: workspace.id,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    }

    await redis.setex(`mcp:session:${sessionId}`, SESSION_TTL, JSON.stringify(session))

    return session
  }

  async destroySession(sessionId: string): Promise<void> {
    await redis.del(`mcp:session:${sessionId}`)
  }

  private extractApiKey(request: any): string | null {
    // From _meta.apiKey (MCP convention)
    if (request.params?._meta?.apiKey) return request.params._meta.apiKey
    // From Authorization header
    const auth = request.headers?.authorization
    if (auth?.startsWith('Bearer ')) return auth.slice(7)
    return null
  }

  private hashForSessionKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 32)
  }

  private async validateApiKey(key: string): Promise<{ id: string } | null> {
    if (!key.startsWith('nx_')) return null

    const prefix = key.slice(0, 14)

    const apiKeys = await prisma.apiKey.findMany({
      where: { keyPrefix: prefix, deletedAt: null },
      include: { workspace: true }
    })

    for (const apiKey of apiKeys) {
      const valid = await bcrypt.compare(key, apiKey.keyHash)
      if (valid) {
        await prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() }
        })
        return apiKey.workspace
      }
    }

    return null
  }
}
```

---

## HTTP Transport (For REST MCP clients)

In addition to stdio, expose MCP over HTTP:

```typescript
// apps/api/src/routes/mcp.ts

// tools/list via HTTP
app.post('/v1/mcp/tools/list', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const tools = await toolRegistry.getToolsForWorkspace(request.workspaceId)

  return reply.send({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: tool.inputSchema.properties ?? {},
        required: tool.inputSchema.required ?? [],
      }
    }))
  })
})

// tools/call via HTTP
app.post('/v1/mcp/tools/call', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const { name, arguments: args } = request.body

  const result = await executionEngine.execute({
    workspaceId: request.workspaceId,
    tool: name,
    arguments: args ?? {},
    source: 'mcp',
  })

  if (result.success) {
    return reply.send({
      content: [{
        type: 'text',
        text: JSON.stringify(result.data, null, 2)
      }]
    })
  } else {
    return reply.status(400).send({
      content: [{
        type: 'text',
        text: `ERROR: ${result.error?.code}: ${result.error?.message}`
      }],
      isError: true,
    })
  }
})
```

---

## How Claude Code Connects To Nexus

Users add this to their Claude Code MCP config:

```json
// ~/.claude/mcp_servers.json
{
  "nexus": {
    "command": "npx",
    "args": ["-y", "@nexus/mcp-server"],
    "env": {
      "NEXUS_API_KEY": "nx_live_your_key_here"
    }
  }
}
```

Or via HTTP transport:
```json
{
  "nexus": {
    "url": "https://your-api.railway.app/v1/mcp",
    "headers": {
      "Authorization": "Bearer nx_live_your_key_here"
    }
  }
}
```

---

## Tool Visibility Rules

```
Only show tools where:
  1. Tool.isActive = true
  2. Connector.isActive = true
  3. Workspace has ACTIVE connection for that connector

Example:
  Workspace has Gmail connected ✅ → GMAIL_* tools visible
  Workspace has GitHub connected ✅ → GITHUB_* tools visible
  Workspace has NO Slack connection → SLACK_* tools hidden
  
AI never sees tools for apps the user hasn't connected.
```

---

## Test Checklist

```
□ Connect with valid API key → session created in Redis
□ tools/list → returns only tools for connected apps
□ tools/call GMAIL_SEND_EMAIL → routes to execution engine → email sent
□ tools/call with invalid tool → error returned (not crash)
□ Session TTL refreshed on each request
□ Session expires after 24h of inactivity
□ Invalid API key → no session created → tools/list returns error
□ HTTP transport: POST /v1/mcp/tools/list → returns tools
□ HTTP transport: POST /v1/mcp/tools/call → executes tool
□ Workspace A session never sees workspace B tools
□ Disconnect Gmail → GMAIL_* tools disappear from list
```
