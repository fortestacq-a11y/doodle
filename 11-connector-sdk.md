# 11 — Connector SDK

## Purpose
Defines the standard interface every connector must follow.
Every connector looks identical to the platform.
The platform never cares if it's Gmail or GitHub — same interface always.

---

## Core Types

```typescript
// packages/connector-sdk/src/types.ts

export type AuthType = 'OAUTH2' | 'API_KEY' | 'BASIC' | 'NONE'

export interface ConnectorDefinition {
  name: string                    // "gmail"
  displayName: string             // "Gmail"
  description: string
  version: string                 // "1.0.0"
  authType: AuthType
  logoUrl?: string
  actions: ActionDefinition[]
}

export interface ActionDefinition {
  name: string                    // "SEND_EMAIL" (without connector prefix)
  displayName: string             // "Send Email"
  description: string
  category: string                // "communication"
  version?: string
  inputSchema: JSONSchema
  outputSchema: JSONSchema
  execute: (context: ExecutionContext) => Promise<ActionResult>
}

export interface ExecutionContext {
  token: string                   // OAuth access token (decrypted, in memory)
  args: Record<string, unknown>   // validated arguments
}

export interface ActionResult {
  success: boolean
  data?: Record<string, unknown>
  error?: {
    code: string
    message: string
    retryable: boolean            // tells engine whether to retry
  }
}

export interface JSONSchema {
  type: 'object'
  properties: Record<string, JSONSchemaProperty>
  required?: string[]
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]
  maxLength?: number
  minLength?: number
  default?: unknown
}
```

---

## defineConnector() Function

```typescript
// packages/connector-sdk/src/define-connector.ts

import type { ConnectorDefinition } from './types'

export function defineConnector(config: ConnectorDefinition): ConnectorDefinition {
  // Validate required fields
  if (!config.name) throw new Error('Connector must have a name')
  if (!config.displayName) throw new Error('Connector must have a displayName')
  if (!config.actions || config.actions.length === 0) {
    throw new Error(`Connector ${config.name} must have at least one action`)
  }

  // Validate each action
  for (const action of config.actions) {
    if (!action.name) throw new Error('Action must have a name')
    if (!action.execute) throw new Error(`Action ${action.name} must have execute function`)
    if (!action.inputSchema) throw new Error(`Action ${action.name} must have inputSchema`)
  }

  // Build actions map for fast lookup
  const actionsMap: Record<string, ActionDefinition> = {}
  for (const action of config.actions) {
    actionsMap[action.name.toLowerCase()] = action
  }

  return {
    ...config,
    actions: config.actions,
    // Internal lookup map
    _actionsMap: actionsMap,
  } as any
}
```

---

## defineAction() Function

```typescript
// packages/connector-sdk/src/define-action.ts

import type { ActionDefinition } from './types'

export function defineAction(config: ActionDefinition): ActionDefinition {
  return {
    version: '1.0.0',
    category: 'general',
    ...config,
  }
}
```

---

## Base HTTP Client

Every connector uses this to call external APIs.
Handles common errors in a standard way.

```typescript
// packages/connector-sdk/src/http-client.ts

export class ConnectorHttpClient {
  private baseUrl: string
  private token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl
    this.token = token
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }

    return this.request<T>('GET', url.toString())
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl)
    return this.request<T>('POST', url.toString(), body)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl)
    return this.request<T>('PATCH', url.toString(), body)
  }

  async delete<T>(path: string): Promise<T> {
    const url = new URL(path, this.baseUrl)
    return this.request<T>('DELETE', url.toString())
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()

      // Throw structured errors the retry handler understands
      throw new Error(`${response.status}: ${errorText}`)
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) return {} as T

    return response.json()
  }
}
```

---

## How To Build A Connector

Every connector follows this exact pattern:

```typescript
// Step 1: Create manifest
// Step 2: Define actions
// Step 3: Export connector

// connectors/example/src/index.ts

import { defineConnector, defineAction } from '@nexus/connector-sdk'

const doSomething = defineAction({
  name: 'DO_SOMETHING',
  displayName: 'Do Something',
  description: 'Does something useful',
  category: 'productivity',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to process',
        maxLength: 1000,
      }
    },
    required: ['message']
  },
  outputSchema: {
    type: 'object',
    properties: {
      result: { type: 'string', description: 'The result' }
    }
  },
  execute: async ({ token, args }) => {
    try {
      // Call external API
      const response = await fetch('https://api.example.com/action', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: args.message }),
      })

      if (!response.ok) {
        const isRetryable = response.status >= 500 || response.status === 429
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: await response.text(),
            retryable: isRetryable,
          }
        }
      }

      const data = await response.json()

      return {
        success: true,
        data: { result: data.result }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        }
      }
    }
  }
})

export const exampleConnector = defineConnector({
  name: 'example',
  displayName: 'Example',
  description: 'An example connector',
  version: '1.0.0',
  authType: 'OAUTH2',
  actions: [doSomething],
})
```

---

## Connector Rules (Never Break)

```
1. Connectors NEVER access the database
2. Connectors NEVER manage OAuth tokens
3. Connectors NEVER call other connectors
4. Connectors NEVER throw uncaught exceptions
   → Always return ActionResult with success: false
5. Connectors ALWAYS set retryable flag correctly
   → 429/5xx: retryable = true
   → 401/403/404: retryable = false
6. Connectors NEVER log OAuth tokens
7. Connectors ALWAYS normalize responses to ActionResult format
```

---

## Test Checklist

```
□ defineConnector() with missing name → throws
□ defineConnector() with no actions → throws
□ defineAction() with missing execute → throws
□ execute() with valid args → returns success: true
□ execute() with API returning 429 → returns retryable: true
□ execute() with API returning 401 → returns retryable: false
□ execute() with network error → returns retryable: true
□ execute() never throws — always returns ActionResult
□ Connector never logs the token
```
