# 03 — System Flow

## Two Critical Flows

Every interaction in Nexus is one of two flows:

1. **Connection Flow** — User connects an app (Gmail, GitHub, etc)
2. **Execution Flow** — AI executes a tool (send email, create issue, etc)

Understand these two flows completely. Everything else is detail.

---

## Flow 1 — OAuth Connection Flow

### Scenario: User wants to connect Gmail

```
STEP 1 — User clicks "Connect Gmail" in dashboard

STEP 2 — Your frontend calls your backend:
  POST /v1/connections/initiate
  {
    "appName": "gmail",
    "workspaceId": "ws_123"
  }

STEP 3 — Your backend (OAuth System):
  → Looks up Gmail OAuth config:
    client_id: YOUR_GOOGLE_CLIENT_ID
    client_secret: YOUR_GOOGLE_CLIENT_SECRET
    scopes: ["gmail.send", "gmail.readonly", "gmail.modify"]
    auth_url: "accounts.google.com/o/oauth2/v2/auth"
    
  → Generates random state (CSRF protection):
    state = crypto.randomBytes(32).toString('hex')
    
  → Stores pending connection in DB:
    {
      id: "conn_pending_456",
      workspaceId: "ws_123",
      appName: "gmail",
      state: state,
      status: "PENDING"
    }
    
  → Builds OAuth URL:
    accounts.google.com/o/oauth2/v2/auth?
      client_id=YOUR_GOOGLE_CLIENT_ID
      redirect_uri=https://your-api.com/v1/oauth/callback
      response_type=code
      scope=gmail.send+gmail.readonly
      state=abc123randomstate
      access_type=offline      ← CRITICAL: gets refresh token
      prompt=consent           ← CRITICAL: forces refresh token every time
      
  → Returns to frontend:
    { "redirectUrl": "accounts.google.com/..." }

STEP 4 — Frontend redirects user to Google:
  window.location.href = redirectUrl

STEP 5 — User sees Google consent screen:
  "Nexus wants to access your Gmail"
  [Allow] [Deny]
  
  ← NOTE: Shows YOUR app name if you register YOUR Google OAuth app

STEP 6 — User clicks Allow. Google redirects to:
  https://your-api.com/v1/oauth/callback?
    code=4/0AX4XfWh...  ← authorization code (valid 60 seconds)
    state=abc123randomstate

STEP 7 — Your OAuth callback handler runs:
  → Verify state matches stored state (CSRF check)
  → Exchange code for tokens:
    POST accounts.google.com/token
    {
      code: "4/0AX4XfWh...",
      client_id: YOUR_GOOGLE_CLIENT_ID,
      client_secret: YOUR_GOOGLE_CLIENT_SECRET,
      redirect_uri: "https://your-api.com/v1/oauth/callback",
      grant_type: "authorization_code"
    }
    
  → Google returns:
    {
      access_token: "ya29.a0AfH6S...",   ← expires in 1 hour
      refresh_token: "1//0GW...",         ← never expires (until revoked)
      expires_in: 3600,
      token_type: "Bearer",
      scope: "gmail.send gmail.readonly"
    }
    
  → Encrypt tokens:
    encrypted_access = AES256.encrypt(access_token, ENCRYPTION_KEY)
    encrypted_refresh = AES256.encrypt(refresh_token, ENCRYPTION_KEY)
    
  → Store in database:
    oauth_tokens table:
    {
      connectionId: "conn_456",
      accessToken: encrypted_access,   ← NEVER store plaintext
      refreshToken: encrypted_refresh, ← NEVER store plaintext
      expiresAt: now + 3600 seconds,
      scope: "gmail.send gmail.readonly"
    }
    
  → Update connection status:
    connections table:
    { id: "conn_456", status: "ACTIVE" }
    
  → Redirect user back to dashboard:
    https://your-dashboard.com/connections?status=connected&app=gmail

STEP 8 — Dashboard shows: "Gmail Connected ✅"
```

---

## Flow 2 — Tool Execution Flow

### Scenario: AI wants to send an email

```
STEP 1 — User tells AI: "Send email to john@gmail.com about the meeting"

STEP 2 — LLM generates tool call:
  {
    "tool": "GMAIL_SEND_EMAIL",
    "arguments": {
      "to": "john@gmail.com",
      "subject": "About the meeting",
      "body": "Hey John, let's meet tomorrow at 3pm."
    }
  }

STEP 3 — MCP Runtime receives this:
  → Identifies workspace from session
  → Forwards to Execution Engine

STEP 4 — API Gateway:
  → Validates API key or JWT
  → Checks rate limit for workspace
  → Passes to Execution Engine

STEP 5 — Execution Engine: VALIDATE TOOL
  → Query Tool Registry: does GMAIL_SEND_EMAIL exist?
  → Get tool schema: requires { to, subject, body }
  → Validate arguments against schema
  → If missing required field → return VALIDATION_ERROR immediately
  
  → Check idempotency:
    idempotencyKey = hash(workspaceId + tool + JSON.stringify(args))
    → If this exact call was made in last 60 seconds → return cached result
    → Prevents duplicate emails on retry

STEP 6 — Execution Engine: CHECK PERMISSIONS
  → Does this workspace have Gmail connected?
  → Is the Gmail connection ACTIVE (not expired/revoked)?
  → Does the workspace have permission to use this tool?
  → If any check fails → return appropriate error

STEP 7 — Execution Engine: GET TOKEN
  → Query Connection Service for workspace's Gmail token
  → Connection Service:
    → Find connection record
    → Check token expiry:
      if (expiresAt < now + 5 minutes) {
        // Token expires soon, refresh it
        → Call Google refresh endpoint:
          POST accounts.google.com/token
          {
            refresh_token: decrypt(stored_refresh_token),
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token"
          }
        → Google returns new access_token
        → Encrypt and store new token
        → Update expiresAt
      }
    → Decrypt access_token in memory
    → Return to Execution Engine (in memory only, never logged)

STEP 8 — Execution Engine: BUILD CONTEXT AND LOG START
  → Create execution record:
    {
      id: "exec_789",
      workspaceId: "ws_123",
      tool: "GMAIL_SEND_EMAIL",
      status: "RUNNING",
      startedAt: now
    }
  → Store input (for audit):
    { to, subject, body }  ← stored, user's data

STEP 9 — Execution Engine: INVOKE CONNECTOR
  → Call Gmail Connector with:
    {
      action: "send_email",
      token: "ya29.a0AfH6S...",  ← in memory only
      args: { to, subject, body }
    }

STEP 10 — Gmail Connector:
  → Build Gmail API request:
    POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
    Authorization: Bearer ya29.a0AfH6S...
    Content-Type: application/json
    {
      "raw": base64encode(
        "To: john@gmail.com\r\n" +
        "Subject: About the meeting\r\n" +
        "Content-Type: text/plain\r\n\r\n" +
        "Hey John, let's meet tomorrow at 3pm."
      )
    }
    
  → Google sends the email
  → Google responds:
    { "id": "18abc123", "threadId": "18abc123", "labelIds": ["SENT"] }
    
  → Connector normalizes:
    {
      "success": true,
      "data": {
        "messageId": "18abc123",
        "threadId": "18abc123"
      }
    }

STEP 11 — Execution Engine: LOG COMPLETION
  → Update execution record:
    {
      status: "SUCCESS",
      completedAt: now,
      durationMs: 843
    }
  → Store output:
    { messageId: "18abc123" }
  → Clear token from memory

STEP 12 — Result travels back:
  Execution Engine → MCP Runtime → LLM
  {
    "success": true,
    "data": { "messageId": "18abc123" }
  }

STEP 13 — LLM responds to user:
  "Email sent to John successfully! ✅"
```

---

## Token Refresh Flow (Automatic)

```
Token expires every 1 hour.
Refresh token never expires.

Before every execution:
  if (token.expiresAt < now + 5min) {
    newToken = refreshWithGoogle(refreshToken)
    encrypt(newToken) → store in DB
    use newToken for this execution
  }

If refresh fails (user revoked access):
  → Update connection status to "REVOKED"
  → Return error: "Gmail connection needs to be reconnected"
  → User sees notification in dashboard
```

---

## Error Flow

```
Error occurs during execution:
  │
  ▼
What type of error?
  │
  ├── VALIDATION_ERROR (wrong args)
  │     → Return immediately, NO retry
  │
  ├── AUTH_ERROR (401 from Gmail)
  │     → Try token refresh once
  │     → If still fails → connection revoked
  │     → NO further retry
  │
  ├── RATE_LIMIT (429 from Gmail)
  │     → Wait 30 seconds → retry
  │     → Wait 2 minutes → retry
  │     → Wait 10 minutes → retry
  │     → If still failing → FAILED
  │
  ├── PROVIDER_ERROR (500 from Gmail)
  │     → Retry with backoff (same as rate limit)
  │
  ├── TIMEOUT (> 30 seconds)
  │     → Mark as TIMEOUT
  │     → Retry once after 1 minute
  │
  └── UNKNOWN_ERROR
        → Log full error
        → Return generic error to client
        → Alert monitoring
        
All errors stored in execution_errors table.
All errors visible in dashboard.
```
