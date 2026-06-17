# 16 — Frontend Dashboard

## Purpose
Simple, clean dashboard where users:
- Connect their apps (Gmail, GitHub, Slack, Notion)
- See available tools
- View execution history
- Manage API keys

---

## Tech Stack
```
Framework:    Next.js 14 (App Router)
Styling:      Tailwind CSS
Components:   shadcn/ui
Data:         TanStack Query (React Query)
Auth:         JWT stored in httpOnly cookie
HTTP Client:  Fetch (wrapped in api.ts)
```

---

## Pages

```
/                     → Redirect to /dashboard or /login
/login                → Login page
/signup               → Signup page
/dashboard            → Overview (stats cards)
/dashboard/connections → Connect/disconnect apps
/dashboard/tools      → Browse available tools
/dashboard/executions → Execution history
/dashboard/executions/[id] → Execution detail
/dashboard/api-keys   → Manage API keys
/dashboard/settings   → Workspace settings
```

---

## API Client

```typescript
// apps/dashboard/src/lib/api.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

class ApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('nexus_token')
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken()

    const response = await fetch(`${API_URL}/v1${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message ?? 'Request failed')
    }

    return response.json()
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem('nexus_token', data.token)
    return data
  }

  async signup(email: string, password: string, name: string) {
    const data = await this.request<{ token: string; user: any; workspace: any }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    })
    localStorage.setItem('nexus_token', data.token)
    return data
  }

  logout() {
    localStorage.removeItem('nexus_token')
    window.location.href = '/login'
  }

  async getMe() {
    return this.request<{ user: any; workspace: any }>('/auth/me')
  }

  // Connections
  async getConnections() {
    return this.request<any[]>('/connections')
  }

  async initiateConnection(appName: string) {
    return this.request<{ redirectUrl: string }>('/connections/initiate', {
      method: 'POST',
      body: JSON.stringify({ appName }),
    })
  }

  async disconnect(connectorName: string) {
    return this.request(`/connections/${connectorName}`, { method: 'DELETE' })
  }

  // Tools
  async getTools() {
    return this.request<any[]>('/tools')
  }

  // Executions
  async getExecutions(limit = 50) {
    return this.request<any>(`/executions?limit=${limit}`)
  }

  async getExecution(id: string) {
    return this.request<any>(`/executions/${id}`)
  }

  async executeTool(tool: string, args: Record<string, unknown>) {
    return this.request<any>('/tools/execute', {
      method: 'POST',
      body: JSON.stringify({ tool, arguments: args }),
    })
  }

  // API Keys
  async getApiKeys() {
    return this.request<any[]>('/api-keys')
  }

  async createApiKey(name: string) {
    return this.request<{ key: string; id: string; name: string }>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }

  async deleteApiKey(id: string) {
    return this.request(`/api-keys/${id}`, { method: 'DELETE' })
  }
}

export const api = new ApiClient()
```

---

## Connections Page (Most Important)

```tsx
// apps/dashboard/src/app/(dashboard)/connections/page.tsx

'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

const APPS = [
  {
    name: 'gmail',
    displayName: 'Gmail',
    description: 'Send and receive emails',
    logo: '📧',
    tools: ['Send Email', 'List Emails', 'Search Emails', 'Reply'],
  },
  {
    name: 'github',
    displayName: 'GitHub',
    description: 'Manage repos, issues, and PRs',
    logo: '🐙',
    tools: ['Create Issue', 'List Issues', 'List Repos', 'Add Comment'],
  },
  {
    name: 'slack',
    displayName: 'Slack',
    description: 'Send messages to channels',
    logo: '💬',
    tools: ['Send Message', 'List Channels'],
  },
  {
    name: 'notion',
    displayName: 'Notion',
    description: 'Create and manage pages',
    logo: '📝',
    tools: ['Create Page', 'Search Pages'],
  },
]

export default function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [connectingApp, setConnectingApp] = useState<string | null>(null)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.getConnections(),
  })

  const connectMutation = useMutation({
    mutationFn: async (appName: string) => {
      setConnectingApp(appName)
      const { redirectUrl } = await api.initiateConnection(appName)
      window.location.href = redirectUrl
    },
    onError: () => setConnectingApp(null),
  })

  const disconnectMutation = useMutation({
    mutationFn: (connectorName: string) => api.disconnect(connectorName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const getConnection = (appName: string) =>
    connections.find((c: any) => c.app === appName)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connections</h1>
        <p className="text-muted-foreground">
          Connect your apps so AI can take actions on your behalf.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {APPS.map((app) => {
          const connection = getConnection(app.name)
          const isConnected = connection?.status === 'ACTIVE'
          const isConnecting = connectingApp === app.name

          return (
            <Card key={app.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{app.logo}</span>
                    <div>
                      <CardTitle>{app.displayName}</CardTitle>
                      <CardDescription>{app.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={isConnected ? 'default' : 'outline'}>
                    {isConnected ? '● Connected' : '○ Not connected'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {isConnected && connection.entityId && (
                  <p className="text-sm text-muted-foreground">
                    Connected as: <strong>{connection.entityId}</strong>
                  </p>
                )}

                <div className="flex flex-wrap gap-1">
                  {app.tools.map((tool) => (
                    <Badge key={tool} variant="secondary" className="text-xs">
                      {tool}
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2">
                  {isConnected ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => disconnectMutation.mutate(app.name)}
                      disabled={disconnectMutation.isPending}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => connectMutation.mutate(app.name)}
                      disabled={isConnecting}
                    >
                      {isConnecting ? 'Connecting...' : `Connect ${app.displayName}`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Executions Page

```tsx
// apps/dashboard/src/app/(dashboard)/executions/page.tsx

'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  QUEUED: 'bg-yellow-100 text-yellow-800',
  TIMEOUT: 'bg-orange-100 text-orange-800',
}

export default function ExecutionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn: () => api.getExecutions(50),
    refetchInterval: 5000, // Poll every 5 seconds for live updates
  })

  if (isLoading) return <div className="p-6">Loading...</div>

  const executions = data?.executions ?? []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Executions</h1>
        <p className="text-muted-foreground">Every tool execution your AI has made.</p>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Tool</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Duration</th>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {executions.map((exec: any) => (
              <tr key={exec.id} className="border-b hover:bg-muted/25">
                <td className="px-4 py-3 font-mono text-xs">{exec.tool}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[exec.status]}`}>
                    {exec.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {exec.durationMs ? `${exec.durationMs}ms` : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(exec.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/executions/${exec.id}`}
                    className="text-primary hover:underline text-xs"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}

            {executions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No executions yet. Connect an app and try a tool call.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

## API Keys Page

```tsx
// apps/dashboard/src/app/(dashboard)/api-keys/page.tsx

'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

export default function ApiKeysPage() {
  const queryClient = useQueryClient()
  const [newKeyName, setNewKeyName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)

  const { data: keys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.getApiKeys(),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createApiKey(name),
    onSuccess: (data) => {
      setNewKey(data.key)  // Show once
      setNewKeyName('')
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-muted-foreground">
          Use API keys to authenticate AI agents and MCP clients.
        </p>
      </div>

      {/* New key alert */}
      {newKey && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-green-800 mb-2">
              ⚠️ Copy this key now — it won't be shown again.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 bg-white border rounded px-3 py-2 text-xs font-mono">
                {newKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(newKey)
                }}
              >
                Copy
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setNewKey(null)}
            >
              I've saved it, dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create new key */}
      <div className="flex gap-2">
        <Input
          placeholder="Key name (e.g. My Agent)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          className="max-w-xs"
        />
        <Button
          onClick={() => createMutation.mutate(newKeyName)}
          disabled={!newKeyName || createMutation.isPending}
        >
          Create Key
        </Button>
      </div>

      {/* Keys list */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Prefix</th>
              <th className="px-4 py-3 text-left font-medium">Last Used</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key: any) => (
              <tr key={key.id} className="border-b">
                <td className="px-4 py-3 font-medium">{key.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {key.keyPrefix}...
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(key.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(key.id)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

## Dashboard Sidebar Layout

```tsx
// apps/dashboard/src/app/(dashboard)/layout.tsx

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/connections', label: 'Connections', icon: '🔗' },
  { href: '/dashboard/tools', label: 'Tools', icon: '🔧' },
  { href: '/dashboard/executions', label: 'Executions', icon: '⚡' },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: '🔑' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/20 flex flex-col">
        <div className="p-6 border-b">
          <h1 className="font-bold text-xl">Nexus</h1>
          <p className="text-xs text-muted-foreground">AI Integration Platform</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={() => {
              localStorage.removeItem('nexus_token')
              window.location.href = '/login'
            }}
            className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

---

## Frontend Test Checklist
```
□ Signup → redirects to dashboard
□ Login → stores token → dashboard loads
□ Connections page shows all 4 apps
□ Click Connect Gmail → redirects to Google
□ Return from OAuth → Gmail shows as Connected
□ Connected app shows entity ID (email)
□ Disconnect app → status changes back to Not Connected
□ Executions page loads → shows execution list
□ Execution polling every 5s → new executions appear
□ Click execution → detail page shows input/output
□ Create API key → key shown once with copy button
□ Dismiss key warning → key hidden
□ Delete API key → removed from list
□ Logout → token cleared → redirect to login
□ Protected pages without token → redirect to login
```
