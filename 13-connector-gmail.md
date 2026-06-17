# 13 — Gmail Connector

## Purpose
Connect to Gmail API and expose email actions as Nexus tools.
This is your first and most important connector. Build this first.

---

## Actions Provided

```
GMAIL_SEND_EMAIL       — Send an email
GMAIL_LIST_EMAILS      — List emails from inbox
GMAIL_GET_EMAIL        — Get a single email by ID
GMAIL_SEARCH_EMAILS    — Search emails by query
GMAIL_REPLY_EMAIL      — Reply to an email thread
GMAIL_CREATE_DRAFT     — Create a draft (don't send yet)
GMAIL_GET_PROFILE      — Get the user's Gmail profile
```

---

## Gmail API Basics

```
Base URL:    https://gmail.googleapis.com/gmail/v1
Auth:        Bearer token (OAuth2)
User ID:     Always use "me" (refers to authenticated user)

Key endpoints:
  GET  /users/me/messages          ← list emails
  GET  /users/me/messages/{id}     ← get single email
  POST /users/me/messages/send     ← send email
  POST /users/me/messages          ← create draft
  GET  /users/me/profile           ← get profile

Email format: RFC 2822 encoded as base64url
```

---

## Full Connector Implementation

```typescript
// connectors/gmail/src/index.ts

import { defineConnector, defineAction, ConnectorHttpClient } from '@nexus/connector-sdk'

// ─────────────────────────────────────────
// SEND EMAIL
// ─────────────────────────────────────────
const sendEmail = defineAction({
  name: 'SEND_EMAIL',
  displayName: 'Send Email',
  description: 'Send an email via Gmail',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient email address (or comma-separated list)',
      },
      subject: {
        type: 'string',
        description: 'Email subject line',
        maxLength: 200,
      },
      body: {
        type: 'string',
        description: 'Email body. Plain text or HTML.',
        maxLength: 50000,
      },
      cc: {
        type: 'string',
        description: 'CC email addresses (comma-separated)',
      },
      bcc: {
        type: 'string',
        description: 'BCC email addresses (comma-separated)',
      },
    },
    required: ['to', 'subject', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Gmail message ID' },
      threadId: { type: 'string', description: 'Gmail thread ID' },
    },
  },
  execute: async ({ token, args }) => {
    try {
      const { to, subject, body, cc, bcc } = args as {
        to: string; subject: string; body: string; cc?: string; bcc?: string
      }

      // Build RFC 2822 email
      const lines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        cc ? `Cc: ${cc}` : null,
        bcc ? `Bcc: ${bcc}` : null,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body,
      ].filter(Boolean).join('\r\n')

      // Base64url encode
      const encoded = Buffer.from(lines).toString('base64url')

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: {
            code: `GMAIL_${response.status}`,
            message: error.error?.message ?? 'Failed to send email',
            retryable: response.status >= 500 || response.status === 429,
          }
        }
      }

      const data = await response.json()

      return {
        success: true,
        data: {
          messageId: data.id,
          threadId: data.threadId,
        }
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

// ─────────────────────────────────────────
// LIST EMAILS
// ─────────────────────────────────────────
const listEmails = defineAction({
  name: 'LIST_EMAILS',
  displayName: 'List Emails',
  description: 'List emails from Gmail inbox',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description: 'Maximum number of emails to return (default: 10, max: 50)',
      },
      labelIds: {
        type: 'string',
        description: 'Filter by label: INBOX, SENT, DRAFT, SPAM, TRASH',
        default: 'INBOX',
      },
      query: {
        type: 'string',
        description: 'Gmail search query (e.g., "from:john@gmail.com is:unread")',
      },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      emails: { type: 'array', description: 'List of emails' },
      total: { type: 'number', description: 'Total count' },
    }
  },
  execute: async ({ token, args }) => {
    try {
      const maxResults = Math.min(Number(args.maxResults ?? 10), 50)
      const labelIds = (args.labelIds as string) ?? 'INBOX'
      const query = args.query as string | undefined

      // Get message list
      const params = new URLSearchParams({
        maxResults: maxResults.toString(),
        labelIds,
      })
      if (query) params.set('q', query)

      const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (!listResponse.ok) {
        const error = await listResponse.json()
        return {
          success: false,
          error: {
            code: `GMAIL_${listResponse.status}`,
            message: error.error?.message ?? 'Failed to list emails',
            retryable: listResponse.status >= 500,
          }
        }
      }

      const listData = await listResponse.json()
      const messages = listData.messages ?? []

      if (messages.length === 0) {
        return { success: true, data: { emails: [], total: 0 } }
      }

      // Fetch details for each message in parallel
      const emailDetails = await Promise.all(
        messages.slice(0, maxResults).map(async (msg: { id: string }) => {
          const detailResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } }
          )

          if (!detailResponse.ok) return null

          const detail = await detailResponse.json()
          const headers = detail.payload?.headers ?? []

          const getHeader = (name: string) =>
            headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

          return {
            id: detail.id,
            threadId: detail.threadId,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            snippet: detail.snippet,
            isUnread: detail.labelIds?.includes('UNREAD') ?? false,
          }
        })
      )

      const emails = emailDetails.filter(Boolean)

      return {
        success: true,
        data: {
          emails,
          total: listData.resultSizeEstimate ?? emails.length,
        }
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

// ─────────────────────────────────────────
// GET EMAIL (full content)
// ─────────────────────────────────────────
const getEmail = defineAction({
  name: 'GET_EMAIL',
  displayName: 'Get Email',
  description: 'Get the full content of a single email by ID',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'Gmail message ID (from list emails)',
      }
    },
    required: ['messageId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      date: { type: 'string' },
    }
  },
  execute: async ({ token, args }) => {
    try {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.messageId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: {
            code: `GMAIL_${response.status}`,
            message: error.error?.message ?? 'Email not found',
            retryable: false,
          }
        }
      }

      const data = await response.json()
      const headers = data.payload?.headers ?? []

      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

      // Extract body
      const body = extractBody(data.payload)

      return {
        success: true,
        data: {
          id: data.id,
          threadId: data.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          body,
          snippet: data.snippet,
          isUnread: data.labelIds?.includes('UNREAD') ?? false,
        }
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

// ─────────────────────────────────────────
// SEARCH EMAILS
// ─────────────────────────────────────────
const searchEmails = defineAction({
  name: 'SEARCH_EMAILS',
  displayName: 'Search Emails',
  description: 'Search Gmail using Gmail search syntax',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Gmail search query. Examples: "from:john@gmail.com", "subject:meeting", "is:unread", "has:attachment", "after:2024/01/01"',
      },
      maxResults: {
        type: 'number',
        description: 'Max emails to return (default: 10)',
      }
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      emails: { type: 'array' },
      total: { type: 'number' },
    }
  },
  execute: async ({ token, args }) => {
    // Reuse LIST_EMAILS logic with query
    return listEmails.execute({
      token,
      args: {
        query: args.query,
        maxResults: args.maxResults ?? 10,
      }
    })
  }
})

// ─────────────────────────────────────────
// REPLY TO EMAIL
// ─────────────────────────────────────────
const replyEmail = defineAction({
  name: 'REPLY_EMAIL',
  displayName: 'Reply to Email',
  description: 'Reply to an existing email thread',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: {
        type: 'string',
        description: 'The message ID to reply to',
      },
      body: {
        type: 'string',
        description: 'Reply body text',
      },
    },
    required: ['messageId', 'body'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      threadId: { type: 'string' },
    }
  },
  execute: async ({ token, args }) => {
    try {
      // Get original message to extract thread info and headers
      const original = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (!original.ok) {
        return {
          success: false,
          error: {
            code: 'GMAIL_404',
            message: 'Original message not found',
            retryable: false,
          }
        }
      }

      const originalData = await original.json()
      const headers = originalData.payload?.headers ?? []

      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

      const from = getHeader('From')
      const subject = getHeader('Subject')
      const messageId = getHeader('Message-ID')

      // Build reply with In-Reply-To header (keeps thread together)
      const lines = [
        `To: ${from}`,
        `Subject: Re: ${subject.startsWith('Re:') ? subject.slice(3).trim() : subject}`,
        messageId ? `In-Reply-To: ${messageId}` : null,
        messageId ? `References: ${messageId}` : null,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        args.body as string,
      ].filter(Boolean).join('\r\n')

      const encoded = Buffer.from(lines).toString('base64url')

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            raw: encoded,
            threadId: originalData.threadId,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: {
            code: `GMAIL_${response.status}`,
            message: error.error?.message ?? 'Failed to send reply',
            retryable: response.status >= 500,
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: { messageId: data.id, threadId: data.threadId }
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

// ─────────────────────────────────────────
// GET PROFILE
// ─────────────────────────────────────────
const getProfile = defineAction({
  name: 'GET_PROFILE',
  displayName: 'Get Gmail Profile',
  description: 'Get the authenticated user\'s Gmail profile',
  category: 'communication',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      messagesTotal: { type: 'number' },
      threadsTotal: { type: 'number' },
    }
  },
  execute: async ({ token }) => {
    try {
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `GMAIL_${response.status}`,
            message: 'Failed to get profile',
            retryable: false,
          }
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: {
          email: data.emailAddress,
          messagesTotal: data.messagesTotal,
          threadsTotal: data.threadsTotal,
        }
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

// ─────────────────────────────────────────
// HELPER: Extract email body from payload
// ─────────────────────────────────────────
function extractBody(payload: any): string {
  if (!payload) return ''

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }

  // Multipart — find text/plain first, then text/html
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64url').toString('utf-8')
    }

    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (htmlPart?.body?.data) {
      // Strip HTML tags for plain text
      const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8')
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }

    // Nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  return ''
}

// ─────────────────────────────────────────
// EXPORT CONNECTOR
// ─────────────────────────────────────────
export const gmailConnector = defineConnector({
  name: 'gmail',
  displayName: 'Gmail',
  description: 'Send and receive emails via Gmail',
  version: '1.0.0',
  authType: 'OAUTH2',
  logoUrl: '/logos/gmail.svg',
  actions: [
    sendEmail,
    listEmails,
    getEmail,
    searchEmails,
    replyEmail,
    getProfile,
  ],
})
```

---

## OAuth Config For Gmail

```typescript
// connectors/gmail/src/auth.ts

export const gmailAuth = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  scopes: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  // CRITICAL: these two get you a refresh token
  additionalParams: {
    access_type: 'offline',
    prompt: 'consent',
  }
}
```

---

## Test Checklist

```
□ Send email to yourself → email arrives in Gmail
□ List emails → returns 10 inbox emails with from/subject/date
□ Get email by ID → returns full body
□ Search emails "is:unread" → returns unread emails
□ Search "from:john@example.com" → filters correctly
□ Reply to email → appears in correct thread
□ Get profile → returns your email address
□ Invalid token → returns AUTH_ERROR with retryable: false
□ Gmail rate limit → returns retryable: true
□ Network error → returns retryable: true
□ All actions: never throw, always return ActionResult
```
