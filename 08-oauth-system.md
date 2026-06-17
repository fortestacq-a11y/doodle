# 08 — OAuth System

## Purpose
Securely connect user accounts to external apps.
Handle the entire OAuth 2.0 flow from redirect to token storage.
Auto-refresh tokens before they expire.

---

## OAuth Config Per Provider

```typescript
// packages/connector-sdk/src/oauth-configs.ts

export const OAUTH_CONFIGS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
    scopes: {
      gmail: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
    },
    // CRITICAL: these get refresh tokens
    params: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
  
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    redirectUri: process.env.GITHUB_REDIRECT_URI!,
    scopes: {
      github: ['repo', 'read:user', 'user:email'],
    },
    // GitHub tokens don't expire (no refresh needed)
    params: {},
  },
  
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId: process.env.SLACK_CLIENT_ID!,
    clientSecret: process.env.SLACK_CLIENT_SECRET!,
    redirectUri: process.env.SLACK_REDIRECT_URI!,
    scopes: {
      slack: [
        'channels:read',
        'chat:write',
        'users:read',
        'files:write',
      ],
    },
    params: {},
  },
  
  notion: {
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    clientId: process.env.NOTION_CLIENT_ID!,
    clientSecret: process.env.NOTION_CLIENT_SECRET!,
    redirectUri: process.env.NOTION_REDIRECT_URI!,
    scopes: {
      notion: [], // Notion uses owner param instead of scope
    },
    params: {
      owner: 'user',
    },
  },
}
```

---

## OAuth Service — Full Implementation

```typescript
// apps/api/src/services/oauth.service.ts

import crypto from 'crypto'
import { prisma } from '@nexus/database'
import { encrypt, decrypt } from '@nexus/encryption'
import { redis } from '../lib/redis'
import { OAUTH_CONFIGS } from '@nexus/connector-sdk'

export class OAuthService {
  
  // ─────────────────────────────────────────
  // STEP 1: Initiate OAuth flow
  // ─────────────────────────────────────────
  async initiateConnection(workspaceId: string, appName: string) {
    const config = OAUTH_CONFIGS[appName]
    if (!config) throw new Error(`Unknown app: ${appName}`)
    
    // Find connector in DB
    const connector = await prisma.connector.findUnique({
      where: { name: appName }
    })
    if (!connector) throw new Error(`Connector not found: ${appName}`)
    
    // Create or update pending connection
    const connection = await prisma.connection.upsert({
      where: { workspaceId_connectorId: { workspaceId, connectorId: connector.id } },
      update: { status: 'PENDING' },
      create: {
        workspaceId,
        connectorId: connector.id,
        entityId: '',  // filled after OAuth completes
        status: 'PENDING',
      }
    })
    
    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')
    
    // Store state in Redis (expires in 10 minutes)
    await redis.setex(
      `oauth:state:${state}`,
      600,
      JSON.stringify({ connectionId: connection.id, workspaceId, appName })
    )
    
    // Build scopes
    const allScopes = Object.values(config.scopes).flat()
    
    // Build auth URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: allScopes.join(' '),
      state,
      ...config.params,
    })
    
    const redirectUrl = `${config.authUrl}?${params.toString()}`
    
    return { redirectUrl, connectionId: connection.id }
  }
  
  // ─────────────────────────────────────────
  // STEP 2: Handle OAuth callback
  // ─────────────────────────────────────────
  async handleCallback(provider: string, code: string, state: string) {
    // Verify state (CSRF protection)
    const stateData = await redis.get(`oauth:state:${state}`)
    if (!stateData) {
      throw new Error('Invalid or expired state. Please try connecting again.')
    }
    
    const { connectionId, workspaceId, appName } = JSON.parse(stateData)
    
    // Delete state immediately (one-time use)
    await redis.del(`oauth:state:${state}`)
    
    const config = OAUTH_CONFIGS[appName]
    
    // Exchange code for tokens
    const tokens = await this.exchangeCode(config, code)
    
    // Get user info (to set entityId — their email/username)
    const entityId = await this.getUserIdentifier(appName, tokens.access_token)
    
    // Encrypt and store tokens
    await prisma.oAuthToken.upsert({
      where: { connectionId },
      update: {
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        expiresAt: tokens.expires_in 
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for non-expiring
        scope: tokens.scope || '',
        tokenType: tokens.token_type || 'Bearer',
      },
      create: {
        connectionId,
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        scope: tokens.scope || '',
        tokenType: tokens.token_type || 'Bearer',
      }
    })
    
    // Mark connection as ACTIVE
    await prisma.connection.update({
      where: { id: connectionId },
      data: {
        status: 'ACTIVE',
        entityId,
        connectedAt: new Date(),
      }
    })
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorId: await this.getWorkspaceOwner(workspaceId),
        action: `CONNECT_${appName.toUpperCase()}`,
        resourceType: 'connection',
        resourceId: connectionId,
      }
    })
    
    return { connectionId, appName, status: 'ACTIVE' }
  }
  
  // ─────────────────────────────────────────
  // Exchange authorization code for tokens
  // ─────────────────────────────────────────
  private async exchangeCode(config: any, code: string) {
    const body = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    })
    
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }
    
    return response.json()
  }
  
  // ─────────────────────────────────────────
  // Get user identifier after OAuth
  // ─────────────────────────────────────────
  private async getUserIdentifier(appName: string, accessToken: string): Promise<string> {
    try {
      switch (appName) {
        case 'google': {
          const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          const data = await res.json()
          return data.email
        }
        case 'github': {
          const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          const data = await res.json()
          return data.login
        }
        case 'slack': {
          const res = await fetch('https://slack.com/api/auth.test', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          const data = await res.json()
          return data.user
        }
        case 'notion': {
          return 'notion_user'
        }
        default:
          return 'unknown'
      }
    } catch {
      return 'unknown'
    }
  }
  
  // ─────────────────────────────────────────
  // Get decrypted token for execution
  // ─────────────────────────────────────────
  async getAccessToken(workspaceId: string, connectorName: string): Promise<string> {
    const connector = await prisma.connector.findUnique({ where: { name: connectorName } })
    if (!connector) throw new Error(`Unknown connector: ${connectorName}`)
    
    const connection = await prisma.connection.findUnique({
      where: { workspaceId_connectorId: { workspaceId, connectorId: connector.id } },
      include: { oauthToken: true }
    })
    
    if (!connection) {
      throw new Error(`${connectorName} is not connected. Please connect it in the dashboard.`)
    }
    
    if (connection.status !== 'ACTIVE') {
      throw new Error(`${connectorName} connection is ${connection.status}. Please reconnect.`)
    }
    
    const token = connection.oauthToken!
    
    // Check if token needs refresh (refresh 5 minutes before expiry)
    if (token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
      return this.refreshToken(connection.id, connectorName, token)
    }
    
    // Decrypt and return — token lives in memory only
    return decrypt(token.accessToken)
  }
  
  // ─────────────────────────────────────────
  // Refresh expired token
  // ─────────────────────────────────────────
  private async refreshToken(
    connectionId: string,
    connectorName: string,
    token: any
  ): Promise<string> {
    if (!token.refreshToken) {
      // No refresh token — mark as expired
      await prisma.connection.update({
        where: { id: connectionId },
        data: { status: 'EXPIRED' }
      })
      throw new Error(`${connectorName} token expired and cannot be refreshed. Please reconnect.`)
    }
    
    const config = OAUTH_CONFIGS[connectorName]
    const refreshToken = decrypt(token.refreshToken)
    
    try {
      const body = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      })
      
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      })
      
      if (!response.ok) {
        // Refresh failed — user revoked access
        await prisma.connection.update({
          where: { id: connectionId },
          data: { status: 'REVOKED' }
        })
        throw new Error(`${connectorName} access was revoked. Please reconnect.`)
      }
      
      const newTokens = await response.json()
      
      // Store new tokens
      await prisma.oAuthToken.update({
        where: { connectionId },
        data: {
          accessToken: encrypt(newTokens.access_token),
          // Some providers also rotate refresh tokens
          ...(newTokens.refresh_token && {
            refreshToken: encrypt(newTokens.refresh_token)
          }),
          expiresAt: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000),
        }
      })
      
      return newTokens.access_token // Return plaintext for immediate use
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('reconnect')) {
        throw error
      }
      throw new Error(`Failed to refresh ${connectorName} token: ${error}`)
    }
  }
  
  // ─────────────────────────────────────────
  // Disconnect an app
  // ─────────────────────────────────────────
  async disconnect(workspaceId: string, connectorName: string) {
    const connector = await prisma.connector.findUnique({ where: { name: connectorName } })
    if (!connector) throw new Error(`Unknown connector: ${connectorName}`)
    
    const connection = await prisma.connection.findUnique({
      where: { workspaceId_connectorId: { workspaceId, connectorId: connector.id } },
      include: { oauthToken: true }
    })
    
    if (!connection) throw new Error('Connection not found')
    
    // Try to revoke token at provider
    try {
      const config = OAUTH_CONFIGS[connectorName]
      if (config.revokeUrl && connection.oauthToken) {
        const accessToken = decrypt(connection.oauthToken.accessToken)
        await fetch(`${config.revokeUrl}?token=${accessToken}`, { method: 'POST' })
      }
    } catch {
      // Ignore revocation errors — still delete locally
    }
    
    // Delete token and update connection
    await prisma.oAuthToken.delete({ where: { connectionId: connection.id } })
    await prisma.connection.update({
      where: { id: connection.id },
      data: { status: 'REVOKED' }
    })
    
    return { success: true }
  }
  
  private async getWorkspaceOwner(workspaceId: string): Promise<string> {
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, role: 'OWNER' }
    })
    return member?.userId ?? 'system'
  }
}
```

---

## OAuth Routes

```typescript
// apps/api/src/routes/oauth.ts

// Initiate connection
app.post('/v1/connections/initiate', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const { appName } = request.body
  const result = await oauthService.initiateConnection(request.workspaceId, appName)
  return reply.send(result)
})

// OAuth callback (called by provider after user grants permission)
app.get('/v1/oauth/callback/:provider', async (request, reply) => {
  const { provider } = request.params
  const { code, state, error } = request.query
  
  if (error) {
    // User denied permission
    return reply.redirect(`${process.env.DASHBOARD_URL}/connections?error=denied&app=${provider}`)
  }
  
  try {
    await oauthService.handleCallback(provider, code, state)
    return reply.redirect(`${process.env.DASHBOARD_URL}/connections?status=connected&app=${provider}`)
  } catch (err) {
    return reply.redirect(`${process.env.DASHBOARD_URL}/connections?error=failed&app=${provider}`)
  }
})

// Get all connections for workspace
app.get('/v1/connections', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const connections = await prisma.connection.findMany({
    where: { workspaceId: request.workspaceId },
    include: { connector: true }
  })
  
  return reply.send(connections.map(c => ({
    id: c.id,
    app: c.connector.name,
    displayName: c.connector.displayName,
    status: c.status,
    entityId: c.entityId,
    connectedAt: c.connectedAt,
  })))
})

// Disconnect an app
app.delete('/v1/connections/:connectorName', {
  preHandler: [authenticate, requireWorkspace]
}, async (request, reply) => {
  const result = await oauthService.disconnect(request.workspaceId, request.params.connectorName)
  return reply.send(result)
})
```

---

## Test Checklist

```
□ Initiate Gmail connection → returns redirectUrl
□ Visit redirectUrl → Google consent screen appears
□ Allow → callback fires → token stored encrypted
□ Connection status = ACTIVE in DB
□ Token in DB is encrypted (not plaintext)
□ getAccessToken() returns decrypted token
□ Token near expiry → auto refresh works
□ Revoked token → status updates to REVOKED
□ Disconnect → token deleted
□ State mismatch → callback rejected (CSRF protection)
□ Expired state → callback rejected
□ Two different workspaces → separate connection records
```
