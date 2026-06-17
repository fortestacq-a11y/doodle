# 09 — Tool Registry

## Purpose
Single source of truth for every tool in Nexus.
No service hardcodes tool definitions.
Everything discovered from here.

---

## What The Registry Stores

```
For every tool:
  - name          (GMAIL_SEND_EMAIL)
  - displayName   (Send Email)
  - description   (Send an email via Gmail)
  - connector     (gmail)
  - category      (communication)
  - inputSchema   (JSON Schema — what args it needs)
  - outputSchema  (JSON Schema — what it returns)
  - version       (1.0.0)
  - isActive      (true/false)
```

---

## Tool Registration Flow

Tools are registered at server startup from connector definitions.

```
Server starts
  ↓
Load all connectors (gmail, github, slack, notion)
  ↓
For each connector → read actions
  ↓
Upsert into tools + tool_versions table
  ↓
Cache in Redis
  ↓
Registry ready
```

---

## Registry Service — Full Implementation

```typescript
// packages/tool-registry/src/registry.ts

import { prisma } from '@nexus/database'
import { redis } from '../lib/redis'
import type { ConnectorDefinition } from '@nexus/connector-sdk'

const CACHE_TTL = 300 // 5 minutes
const CACHE_KEY = 'tool_registry:'

export class ToolRegistry {

  // ─────────────────────────────────────────
  // Register tools from a connector
  // Called at startup for each connector
  // ─────────────────────────────────────────
  async registerConnector(connector: ConnectorDefinition) {
    // Find or create connector in DB
    const dbConnector = await prisma.connector.upsert({
      where: { name: connector.name },
      update: {
        displayName: connector.displayName,
        description: connector.description,
        version: connector.version,
        isActive: true,
      },
      create: {
        name: connector.name,
        displayName: connector.displayName,
        description: connector.description,
        version: connector.version,
        authType: connector.authType,
        isActive: true,
      }
    })

    // Register each action as a tool
    for (const action of connector.actions) {
      const toolName = `${connector.name.toUpperCase()}_${action.name.toUpperCase()}`

      const tool = await prisma.tool.upsert({
        where: { name: toolName },
        update: {
          displayName: action.displayName,
          description: action.description,
          category: action.category,
          isActive: true,
        },
        create: {
          connectorId: dbConnector.id,
          name: toolName,
          displayName: action.displayName,
          description: action.description,
          category: action.category,
          isActive: true,
        }
      })

      // Create new version if schema changed
      const latestVersion = await prisma.toolVersion.findFirst({
        where: { toolId: tool.id, isLatest: true }
      })

      const schemasMatch = latestVersion &&
        JSON.stringify(latestVersion.inputSchema) === JSON.stringify(action.inputSchema) &&
        JSON.stringify(latestVersion.outputSchema) === JSON.stringify(action.outputSchema)

      if (!schemasMatch) {
        // Mark old versions as not latest
        if (latestVersion) {
          await prisma.toolVersion.update({
            where: { id: latestVersion.id },
            data: { isLatest: false }
          })
        }

        // Create new version
        await prisma.toolVersion.create({
          data: {
            toolId: tool.id,
            version: action.version ?? '1.0.0',
            inputSchema: action.inputSchema,
            outputSchema: action.outputSchema,
            isLatest: true,
          }
        })
      }
    }

    // Invalidate cache after registration
    await this.invalidateCache()

    console.log(`✓ Registered connector: ${connector.name} (${connector.actions.length} tools)`)
  }

  // ─────────────────────────────────────────
  // Get all tools (with optional filtering)
  // ─────────────────────────────────────────
  async getAllTools(options?: {
    connectorName?: string
    category?: string
    activeOnly?: boolean
  }) {
    const cacheKey = `${CACHE_KEY}all:${JSON.stringify(options ?? {})}`

    // Try cache first
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const tools = await prisma.tool.findMany({
      where: {
        isActive: options?.activeOnly !== false ? true : undefined,
        connector: options?.connectorName
          ? { name: options.connectorName }
          : undefined,
        category: options?.category ?? undefined,
      },
      include: {
        connector: true,
        versions: {
          where: { isLatest: true },
          take: 1,
        }
      },
      orderBy: { name: 'asc' }
    })

    const result = tools.map(t => this.formatTool(t))

    // Cache result
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result))

    return result
  }

  // ─────────────────────────────────────────
  // Get tools available for a workspace
  // Filters based on what apps are connected
  // ─────────────────────────────────────────
  async getToolsForWorkspace(workspaceId: string) {
    const cacheKey = `${CACHE_KEY}workspace:${workspaceId}`

    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    // Get active connections for this workspace
    const connections = await prisma.connection.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      include: { connector: true }
    })

    const connectedApps = new Set(connections.map(c => c.connector.name))

    if (connectedApps.size === 0) return []

    // Get tools only for connected apps
    const tools = await prisma.tool.findMany({
      where: {
        isActive: true,
        connector: { name: { in: Array.from(connectedApps) } }
      },
      include: {
        connector: true,
        versions: {
          where: { isLatest: true },
          take: 1,
        }
      },
      orderBy: { name: 'asc' }
    })

    const result = tools.map(t => this.formatTool(t))

    // Cache per workspace (shorter TTL — connections change)
    await redis.setex(cacheKey, 60, JSON.stringify(result))

    return result
  }

  // ─────────────────────────────────────────
  // Get single tool by name
  // ─────────────────────────────────────────
  async getTool(toolName: string) {
    const cacheKey = `${CACHE_KEY}tool:${toolName}`

    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const tool = await prisma.tool.findUnique({
      where: { name: toolName },
      include: {
        connector: true,
        versions: {
          where: { isLatest: true },
          take: 1,
        }
      }
    })

    if (!tool) return null

    const result = this.formatTool(tool)
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result))

    return result
  }

  // ─────────────────────────────────────────
  // Validate tool arguments against schema
  // ─────────────────────────────────────────
  async validateToolInput(toolName: string, args: Record<string, unknown>) {
    const tool = await this.getTool(toolName)
    if (!tool) {
      return { valid: false, error: `Tool not found: ${toolName}` }
    }

    const schema = tool.inputSchema
    const errors: string[] = []

    // Check required fields
    const required = schema.required ?? []
    for (const field of required) {
      if (args[field] === undefined || args[field] === null || args[field] === '') {
        errors.push(`Missing required field: ${field}`)
      }
    }

    // Check field types
    const properties = schema.properties ?? {}
    for (const [field, value] of Object.entries(args)) {
      const fieldDef = properties[field]
      if (!fieldDef) continue // Unknown field — allow (be lenient)

      const expectedType = fieldDef.type
      const actualType = Array.isArray(value) ? 'array' : typeof value

      if (expectedType && actualType !== expectedType) {
        errors.push(`Field "${field}" must be ${expectedType}, got ${actualType}`)
      }

      if (fieldDef.maxLength && typeof value === 'string' && value.length > fieldDef.maxLength) {
        errors.push(`Field "${field}" exceeds max length of ${fieldDef.maxLength}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      tool,
    }
  }

  // ─────────────────────────────────────────
  // Format tool for API response / MCP
  // ─────────────────────────────────────────
  private formatTool(tool: any) {
    const version = tool.versions[0]
    return {
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      connector: tool.connector.name,
      category: tool.category,
      version: version?.version ?? '1.0.0',
      inputSchema: version?.inputSchema ?? {},
      outputSchema: version?.outputSchema ?? {},
      isActive: tool.isActive,
    }
  }

  // ─────────────────────────────────────────
  // Invalidate all cached tools
  // Called when connectors are updated
  // ─────────────────────────────────────────
  async invalidateCache() {
    const keys = await redis.keys(`${CACHE_KEY}*`)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }

  // ─────────────────────────────────────────
  // Invalidate workspace-specific cache
  // Called when connections change
  // ─────────────────────────────────────────
  async invalidateWorkspaceCache(workspaceId: string) {
    await redis.del(`${CACHE_KEY}workspace:${workspaceId}`)
  }
}

export const toolRegistry = new ToolRegistry()
```

---

## Startup Registration

```typescript
// apps/api/src/index.ts

import { toolRegistry } from '@nexus/tool-registry'
import { gmailConnector } from '@nexus/connector-gmail'
import { githubConnector } from '@nexus/connector-github'
import { slackConnector } from '@nexus/connector-slack'
import { notionConnector } from '@nexus/connector-notion'

async function bootstrap() {
  // Register all connectors at startup
  await toolRegistry.registerConnector(gmailConnector)
  await toolRegistry.registerConnector(githubConnector)
  await toolRegistry.registerConnector(slackConnector)
  await toolRegistry.registerConnector(notionConnector)

  console.log('✓ All connectors registered')

  // Start server
  await app.listen({ port: 3001 })
  console.log('✓ API server running on port 3001')
}

bootstrap()
```

---

## Tool Registry Routes

```typescript
// apps/api/src/routes/tools.ts

// List all tools (optionally filtered by connector or category)
app.get('/v1/tools', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const { connector, category } = request.query
  const tools = await toolRegistry.getToolsForWorkspace(request.workspaceId)

  // Apply optional filters
  let filtered = tools
  if (connector) filtered = filtered.filter(t => t.connector === connector)
  if (category) filtered = filtered.filter(t => t.category === category)

  return reply.send(filtered)
})

// Get single tool details
app.get('/v1/tools/:toolName', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const tool = await toolRegistry.getTool(request.params.toolName)
  if (!tool) {
    return reply.status(404).send({
      error: { code: 'TOOL_NOT_FOUND', message: `Tool not found: ${request.params.toolName}` }
    })
  }
  return reply.send(tool)
})
```

---

## MCP Tool Format

The registry also formats tools for MCP clients:

```typescript
// packages/tool-registry/src/mcp-format.ts

export function toMCPTool(tool: NexusTool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: tool.inputSchema.properties ?? {},
      required: tool.inputSchema.required ?? [],
    }
  }
}
```

MCP clients receive:
```json
{
  "name": "GMAIL_SEND_EMAIL",
  "description": "Send an email via Gmail",
  "inputSchema": {
    "type": "object",
    "properties": {
      "to": { "type": "string", "description": "Recipient email address" },
      "subject": { "type": "string", "description": "Email subject" },
      "body": { "type": "string", "description": "Email body (plain text or HTML)" },
      "cc": { "type": "string", "description": "CC email addresses (comma separated)" }
    },
    "required": ["to", "subject", "body"]
  }
}
```

---

## Test Checklist

```
□ Start server → all connectors register → tools in DB
□ GET /v1/tools → returns only tools for connected apps
□ GET /v1/tools/GMAIL_SEND_EMAIL → returns tool with schema
□ Workspace with no connections → GET /v1/tools returns []
□ Workspace with Gmail connected → Gmail tools appear
□ Workspace with GitHub connected → GitHub tools appear
□ Invalid tool name → 404
□ Cache works: second request faster than first
□ Connect new app → workspace tool cache invalidated
□ Tool schema validates required fields correctly
```
