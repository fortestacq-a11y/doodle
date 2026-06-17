# 21 — Agent Layer

## Purpose
Let users give multi-step goals to AI.
The agent plans, executes tools, evaluates results, and responds.
Agents are consumers of the platform — not the platform itself.

---

## Agent vs Direct Tool Call

```
Direct Tool Call (what you've built so far):
  User: execute GMAIL_SEND_EMAIL with { to, subject, body }
  Platform: executes exactly that one tool
  User: gets result

Agent Call (this doc):
  User: "Read my emails, find anything urgent, draft replies"
  Agent: plans → executes LIST_EMAILS → reads results
       → decides which are urgent → executes GET_EMAIL for each
       → drafts replies using LLM → executes GMAIL_SEND_EMAIL
  User: gets summary of what was done
```

---

## Agent Architecture

```
User Goal
    ↓
Agent API Endpoint
    ↓
LLM (Gemini/GPT/Claude) with tools
    ↓
Tool calls (one or many)
    ↓
Execution Engine (same as always)
    ↓
Results back to LLM
    ↓
LLM decides: done or needs more tool calls
    ↓
Final response to user
```

The agent layer is just an LLM loop that calls your Execution Engine.
Nothing special. No magic. Just structured prompting + tool calling.

---

## Database Tables For Agents

Already defined in schema (04-database.md):

```prisma
model agents {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  type        String   @default("general")
  createdAt   DateTime @default(now())
}

model agent_runs {
  id          String   @id @default(cuid())
  agentId     String?  // null for one-off runs
  workspaceId String
  goal        String   // the user's goal
  status      String   @default("RUNNING")
  steps       Json     @default("[]")  // array of steps taken
  result      String?  // final response
  startedAt   DateTime @default(now())
  completedAt DateTime?
}
```

Add agent_run_id to ToolCall so you can trace which agent triggered which executions:

```prisma
model ToolCall {
  ...
  agentRunId  String?  // links to agent_runs.id
  agentRun    AgentRun? @relation(...)
}
```

---

## Agent Service — Full Implementation

```typescript
// apps/api/src/services/agent.service.ts

import { ExecutionEngine } from '@nexus/execution-engine'
import { toolRegistry } from '@nexus/tool-registry'
import { prisma } from '@nexus/database'
import { logger } from '@nexus/logger'

const MAX_STEPS = 10 // prevent infinite loops

interface AgentRunRequest {
  workspaceId: string
  goal: string
  llmProvider: 'gemini' | 'openai' | 'groq'
  apiKey: string
}

interface AgentStep {
  step: number
  type: 'thought' | 'tool_call' | 'tool_result' | 'response'
  content: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  timestamp: string
}

export class AgentService {
  private engine = new ExecutionEngine()

  async run(request: AgentRunRequest) {
    const { workspaceId, goal, llmProvider, apiKey } = request

    // Get available tools for this workspace
    const tools = await toolRegistry.getToolsForWorkspace(workspaceId)

    if (tools.length === 0) {
      return {
        success: false,
        error: 'No tools available. Please connect at least one app first.',
      }
    }

    // Create agent run record
    const agentRun = await prisma.agentRun.create({
      data: {
        workspaceId,
        goal,
        status: 'RUNNING',
        steps: [],
      }
    })

    const steps: AgentStep[] = []
    const messages: any[] = []

    // System prompt — tells LLM what it can do
    const systemPrompt = this.buildSystemPrompt(tools)

    // Initial user message
    messages.push({ role: 'user', content: goal })

    try {
      for (let stepCount = 0; stepCount < MAX_STEPS; stepCount++) {

        // Call LLM with current conversation
        const llmResponse = await this.callLLM({
          provider: llmProvider,
          apiKey,
          systemPrompt,
          messages,
          tools: this.formatToolsForLLM(tools),
        })

        // LLM finished — no more tool calls
        if (llmResponse.type === 'text') {
          steps.push({
            step: stepCount + 1,
            type: 'response',
            content: llmResponse.text,
            timestamp: new Date().toISOString(),
          })

          // Add to conversation history
          messages.push({ role: 'assistant', content: llmResponse.text })

          // Mark run as complete
          await prisma.agentRun.update({
            where: { id: agentRun.id },
            data: {
              status: 'SUCCESS',
              steps,
              result: llmResponse.text,
              completedAt: new Date(),
            }
          })

          return {
            success: true,
            agentRunId: agentRun.id,
            result: llmResponse.text,
            steps,
          }
        }

        // LLM wants to call tools
        if (llmResponse.type === 'tool_calls') {
          // Add assistant's tool call to conversation
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: llmResponse.toolCalls,
          })

          // Execute each tool call
          const toolResults = []

          for (const toolCall of llmResponse.toolCalls) {
            const toolName = toolCall.function.name
            const toolArgs = JSON.parse(toolCall.function.arguments)

            steps.push({
              step: stepCount + 1,
              type: 'tool_call',
              content: `Calling ${toolName}`,
              tool: toolName,
              args: toolArgs,
              timestamp: new Date().toISOString(),
            })

            logger.info({
              agentRunId: agentRun.id,
              toolName,
              step: stepCount + 1,
            }, 'Agent executing tool')

            // Execute via Execution Engine (goes through all checks)
            const result = await this.engine.execute({
              workspaceId,
              tool: toolName,
              arguments: toolArgs,
              source: 'agent',
              agentRunId: agentRun.id,
            })

            const resultContent = result.success
              ? JSON.stringify(result.data)
              : `ERROR: ${result.error?.message}`

            steps.push({
              step: stepCount + 1,
              type: 'tool_result',
              content: resultContent,
              tool: toolName,
              result: result.data,
              timestamp: new Date().toISOString(),
            })

            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: resultContent,
            })
          }

          // Add tool results to conversation
          messages.push(...toolResults)

          // Update steps in DB
          await prisma.agentRun.update({
            where: { id: agentRun.id },
            data: { steps }
          })
        }
      }

      // Hit max steps without finishing
      const timeoutMessage = `Reached maximum steps (${MAX_STEPS}). Here's what was accomplished so far based on the steps taken.`

      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: 'SUCCESS',
          steps,
          result: timeoutMessage,
          completedAt: new Date(),
        }
      })

      return {
        success: true,
        agentRunId: agentRun.id,
        result: timeoutMessage,
        steps,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: 'FAILED',
          steps,
          result: `Failed: ${errorMessage}`,
          completedAt: new Date(),
        }
      })

      logger.error({
        agentRunId: agentRun.id,
        error: errorMessage,
      }, 'Agent run failed')

      return {
        success: false,
        agentRunId: agentRun.id,
        error: errorMessage,
        steps,
      }
    }
  }

  // ─────────────────────────────────────────
  // Call LLM — supports multiple providers
  // ─────────────────────────────────────────
  private async callLLM(params: {
    provider: string
    apiKey: string
    systemPrompt: string
    messages: any[]
    tools: any[]
  }) {
    switch (params.provider) {
      case 'gemini':
        return this.callGemini(params)
      case 'openai':
        return this.callOpenAI(params)
      case 'groq':
        return this.callGroq(params)
      default:
        return this.callGemini(params) // default to Gemini (free)
    }
  }

  private async callGemini(params: any) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${params.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: params.systemPrompt }] },
          contents: params.messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: m.content ? [{ text: m.content }] : m.parts ?? [],
          })),
          tools: [{
            function_declarations: params.tools,
          }],
          generation_config: {
            temperature: 0.1,
            max_output_tokens: 4096,
          },
        }),
      }
    )

    const data = await response.json()
    const candidate = data.candidates?.[0]?.content?.parts?.[0]

    if (candidate?.functionCall) {
      return {
        type: 'tool_calls',
        toolCalls: [{
          id: `call_${Date.now()}`,
          function: {
            name: candidate.functionCall.name,
            arguments: JSON.stringify(candidate.functionCall.args),
          }
        }]
      }
    }

    return {
      type: 'text',
      text: candidate?.text ?? 'Done.',
    }
  }

  private async callOpenAI(params: any) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages,
        ],
        tools: params.tools.map((t: any) => ({
          type: 'function',
          function: t,
        })),
        tool_choice: 'auto',
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })

    const data = await response.json()
    const message = data.choices?.[0]?.message

    if (message?.tool_calls?.length > 0) {
      return { type: 'tool_calls', toolCalls: message.tool_calls }
    }

    return { type: 'text', text: message?.content ?? 'Done.' }
  }

  private async callGroq(params: any) {
    // Groq uses OpenAI-compatible API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages,
        ],
        tools: params.tools.map((t: any) => ({
          type: 'function',
          function: t,
        })),
        tool_choice: 'auto',
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })

    const data = await response.json()
    const message = data.choices?.[0]?.message

    if (message?.tool_calls?.length > 0) {
      return { type: 'tool_calls', toolCalls: message.tool_calls }
    }

    return { type: 'text', text: message?.content ?? 'Done.' }
  }

  // ─────────────────────────────────────────
  // Format tools for LLM consumption
  // ─────────────────────────────────────────
  private formatToolsForLLM(tools: any[]) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.inputSchema.properties ?? {},
        required: tool.inputSchema.required ?? [],
      }
    }))
  }

  // ─────────────────────────────────────────
  // System prompt — tells LLM what it can do
  // ─────────────────────────────────────────
  private buildSystemPrompt(tools: any[]): string {
    const connectors = [...new Set(tools.map((t: any) => t.connector))]

    return `You are a helpful AI assistant with access to the user's connected apps.

Connected apps: ${connectors.join(', ')}
Available tools: ${tools.length} tools

You can take real actions on behalf of the user using these tools.

Rules:
1. Use tools to accomplish the user's goal
2. Always confirm what you did after completing an action
3. If a tool fails, explain why and suggest alternatives
4. Break complex goals into clear steps
5. Be concise in your responses — users want actions, not lengthy explanations
6. If you're unsure about something, ask before taking irreversible actions (like deleting)

After completing all necessary tool calls, provide a clear summary of what was accomplished.`
  }
}
```

---

## Agent Routes

```typescript
// apps/api/src/routes/agent.ts

app.post('/v1/agent/run', {
  preHandler: [authenticate, requireWorkspace, rateLimit]
}, async (request, reply) => {
  const { goal, llmProvider, llmApiKey } = request.body as any

  if (!goal) {
    return reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'goal is required' }
    })
  }

  const agentService = new AgentService()

  const result = await agentService.run({
    workspaceId: request.workspaceId,
    goal,
    llmProvider: llmProvider ?? 'gemini',
    apiKey: llmApiKey ?? process.env.DEFAULT_LLM_API_KEY!,
  })

  return reply.send(result)
})

// Get agent run history
app.get('/v1/agent/runs', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const runs = await prisma.agentRun.findMany({
    where: { workspaceId: request.workspaceId },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })

  return reply.send(runs.map(r => ({
    id: r.id,
    goal: r.goal,
    status: r.status,
    stepCount: (r.steps as any[]).length,
    result: r.result,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  })))
})

// Get single agent run with full steps
app.get('/v1/agent/runs/:id', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const run = await prisma.agentRun.findFirst({
    where: {
      id: request.params.id,
      workspaceId: request.workspaceId, // isolation
    }
  })

  if (!run) {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Agent run not found' }
    })
  }

  return reply.send(run)
})
```

---

## Agent Chat UI (Dashboard Page)

```tsx
// apps/dashboard/src/app/(dashboard)/agent/page.tsx

'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Step {
  step: number
  type: string
  content: string
  tool?: string
  timestamp: string
}

export default function AgentPage() {
  const [goal, setGoal] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [result, setResult] = useState<string | null>(null)

  const runMutation = useMutation({
    mutationFn: async (goal: string) => {
      setSteps([])
      setResult(null)

      const data = await api.runAgent(goal)
      setSteps(data.steps ?? [])
      setResult(data.result)
      return data
    }
  })

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Agent</h1>
        <p className="text-muted-foreground">
          Tell the AI what you want done. It will use your connected apps to make it happen.
        </p>
      </div>

      {/* Goal input */}
      <div className="space-y-2">
        <Textarea
          placeholder={`Examples:\n• "Read my unread emails and summarize what's important"\n• "Create a GitHub issue for the bug we discussed and notify the team on Slack"\n• "Find emails from john@company.com and draft replies"`}
          value={goal}
          onChange={e => setGoal(e.target.value)}
          rows={4}
          className="resize-none"
        />
        <Button
          onClick={() => runMutation.mutate(goal)}
          disabled={!goal || runMutation.isPending}
          className="w-full"
        >
          {runMutation.isPending ? '⚡ Working...' : '▶ Run'}
        </Button>
      </div>

      {/* Steps (live as they happen) */}
      {steps.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">Steps taken:</h3>
          {steps.map((step, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg text-sm border ${
                step.type === 'tool_call' ? 'bg-blue-50 border-blue-200' :
                step.type === 'tool_result' ? 'bg-green-50 border-green-200' :
                step.type === 'response' ? 'bg-gray-50 border-gray-200' :
                'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-muted-foreground">
                  Step {step.step}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide">
                  {step.type === 'tool_call' ? `🔧 ${step.tool}` :
                   step.type === 'tool_result' ? '✅ Result' :
                   step.type === 'response' ? '💬 Response' : '💭 Thought'}
                </span>
              </div>
              <p className="text-sm">{step.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Final result */}
      {result && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <h3 className="font-medium mb-2">Result:</h3>
          <p className="text-sm whitespace-pre-wrap">{result}</p>
        </div>
      )}
    </div>
  )
}
```

---

## Free LLM Options

```
Gemini Flash (Google):
  Free: 1,000,000 tokens/day
  Model: gemini-1.5-flash
  Get key: aistudio.google.com
  Best for: MVP, high volume

Groq:
  Free: 14,400 requests/day
  Model: llama-3.3-70b-versatile
  Get key: console.groq.com
  Best for: Fast responses

OpenAI:
  Not free — $0.15 per 1M input tokens (gpt-4o-mini)
  Skip for now unless you have credits

Recommendation: Start with Gemini Flash (free + generous limits)
```

---

## Agent Test Checklist

```
□ POST /v1/agent/run with goal → returns steps + result
□ Agent calls LIST_EMAILS → gets real emails from Gmail
□ Agent calls GMAIL_SEND_EMAIL → email actually sent
□ Agent stops after completing goal (doesn't loop)
□ Agent hits MAX_STEPS=10 → returns partial result gracefully
□ Tool fails during agent run → agent handles error, continues or reports
□ Agent run recorded in agent_runs table
□ Tool calls during agent run linked to agentRunId
□ GET /v1/agent/runs → returns run history
□ GET /v1/agent/runs/:id → returns full steps
□ Workspace isolation: user A cannot see user B's agent runs
□ No LLM API key in logs
□ No OAuth tokens visible in agent response
```
