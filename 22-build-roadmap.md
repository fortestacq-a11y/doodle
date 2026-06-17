# 22 — Build Roadmap

## The Complete Build Order

This is your day-by-day plan. Follow it exactly.
Do not skip phases. Do not build Phase 3 before Phase 2 works.
Test every phase before moving on.

---

## Phase 0 — Setup (Day 1)

**Goal:** Working monorepo, database connected, server starts.

```
Tasks:
  □ Run Prompt 1.1 → create monorepo structure
  □ Run Prompt 1.2 → Prisma schema + migrations
  □ Run Prompt 1.3 → encryption package
  □ Run docker-compose up → postgres + redis running locally
  □ Run pnpm db:migrate:dev → tables created
  □ Run pnpm db:seed → connectors seeded
  □ Run pnpm dev → all apps start without errors

Done when:
  ✓ pnpm dev runs without errors
  ✓ GET http://localhost:3001/v1/health → { status: "ok" }
  ✓ Can see tables in Prisma Studio (pnpm db:studio)
  ✓ encrypt("test") then decrypt() returns "test"
```

---

## Phase 1 — Auth (Days 2-3)

**Goal:** Users can sign up, log in, get JWT, use API keys.

```
Tasks:
  □ Run Prompt 2.1 → Fastify app setup
  □ Run Prompt 2.2 → auth routes + middleware
  □ Test every item in auth test checklist (07-auth-system.md)

Done when:
  ✓ POST /v1/auth/signup → creates user + workspace + returns JWT
  ✓ POST /v1/auth/login → returns JWT
  ✓ GET /v1/auth/me with JWT → returns user info
  ✓ GET /v1/connections without token → 401
  ✓ Create API key → shown once
  ✓ Use API key in Authorization header → authenticated
  ✓ Rate limit test: 101 requests in 1 minute → 429

Manual Test Script:
  # Signup
  curl -X POST http://localhost:3001/v1/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"email":"you@test.com","password":"test123","name":"You"}'
  # Copy the token from response

  # Use token
  curl http://localhost:3001/v1/auth/me \
    -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Phase 2 — OAuth (Days 4-6)

**Goal:** Users can connect Gmail. Tokens stored encrypted. Token refresh works.

```
Tasks:
  □ Register Google OAuth app (see 06-environment.md)
  □ Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in .env
  □ Run Prompt 3.1 → OAuth service + routes
  □ Test connection flow manually

Done when:
  ✓ POST /v1/connections/initiate { appName: "gmail" } → returns redirectUrl
  ✓ Visit redirectUrl → Google consent screen with YOUR app name
  ✓ Click Allow → redirected back → GET /v1/connections shows Gmail as ACTIVE
  ✓ oauth_tokens table has encrypted values (not plaintext)
  ✓ Connection shows entityId (your email address)
  ✓ Disconnect → status changes to REVOKED
  ✓ Reconnect → works again

Manual Test:
  # Initiate
  curl -X POST http://localhost:3001/v1/connections/initiate \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"appName":"gmail"}'
  # Open the redirectUrl in browser
  # Approve access
  # Check connections
  curl http://localhost:3001/v1/connections \
    -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Phase 3 — Tool Registry (Day 7)

**Goal:** Tools registered at startup. Tool list returns only connected app tools.

```
Tasks:
  □ Run Prompt 5.1 → connector SDK
  □ Run Prompt 5.2 → Gmail connector (implement actions)
  □ Run Prompt 4.1 → tool registry
  □ Wire connectors into startup registration

Done when:
  ✓ Server starts → logs "✓ Registered connector: gmail (6 tools)"
  ✓ GET /v1/tools (with Gmail connected) → returns GMAIL_* tools
  ✓ GET /v1/tools (no connections) → returns []
  ✓ GET /v1/tools/GMAIL_SEND_EMAIL → returns schema with required fields
  ✓ GET /v1/tools/FAKE_TOOL → 404

Manual Test:
  curl http://localhost:3001/v1/tools \
    -H "Authorization: Bearer YOUR_TOKEN"
  # Should see GMAIL_SEND_EMAIL, GMAIL_LIST_EMAILS, etc
```

---

## Phase 4 — Execution Engine (Days 8-10)

**Goal:** Can actually send a real email through the platform.

```
Tasks:
  □ Run Prompt 4.2 → execution engine (with retry + idempotency)
  □ Connect to Gmail connector router
  □ Test every execution scenario

Done when:
  ✓ POST /v1/tools/execute GMAIL_SEND_EMAIL → email arrives in inbox
  ✓ Execution record created in tool_calls table
  ✓ Input stored in tool_call_inputs
  ✓ Output stored in tool_call_outputs
  ✓ GET /v1/executions → shows the execution
  ✓ GET /v1/executions/:id → shows input/output/duration
  ✓ Execute with missing required field → 400 VALIDATION_ERROR, no execution created
  ✓ Execute with Gmail not connected → CONNECTOR_NOT_CONNECTED error
  ✓ Same request twice in 60 seconds → second returns same result (idempotency)

THIS IS THE MOST IMPORTANT TEST:
  curl -X POST http://localhost:3001/v1/tools/execute \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "tool": "GMAIL_SEND_EMAIL",
      "arguments": {
        "to": "your-email@gmail.com",
        "subject": "Test from Nexus",
        "body": "This email was sent by my own platform!"
      }
    }'
  # Check your inbox
```

---

## Phase 5 — More Connectors (Days 11-12)

**Goal:** GitHub, Slack, Notion all working.

```
Tasks:
  □ Register GitHub OAuth app
  □ Register Slack OAuth app  
  □ Register Notion integration
  □ Run Prompt 5.3 → GitHub + Slack + Notion connectors
  □ Fill all OAuth credentials in .env
  □ Test each connector

Done when:
  ✓ Connect GitHub → CREATE_ISSUE works → issue appears on GitHub
  ✓ Connect Slack → SEND_MESSAGE works → message appears in Slack
  ✓ Connect Notion → CREATE_PAGE works → page appears in Notion
  ✓ All connectors appear in tool list when connected
```

---

## Phase 6 — MCP Runtime (Day 13)

**Goal:** Claude Code or Cursor can discover and use your tools.

```
Tasks:
  □ Run Prompt 6.1 → MCP runtime
  □ Configure Claude Code to use your MCP server
  □ Test tool discovery and execution via MCP

Done when:
  ✓ POST /v1/mcp/tools/list → returns tools formatted for MCP
  ✓ POST /v1/mcp/tools/call GMAIL_SEND_EMAIL → email sent
  ✓ Claude Code can list your tools
  ✓ Claude Code can execute a tool through your platform

Configure Claude Code:
  # ~/.claude/mcp_servers.json (or wherever Claude Code reads from)
  {
    "nexus": {
      "url": "http://localhost:3001/v1/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }

  # Then in Claude Code:
  # "list my gmail emails" → should use your GMAIL_LIST_EMAILS tool
```

---

## Phase 7 — Frontend (Days 14-16)

**Goal:** Clean dashboard that works for non-technical users.

```
Tasks:
  □ Run Prompt 7.1 → Next.js dashboard
  □ Set NEXT_PUBLIC_API_URL=http://localhost:3001 in dashboard .env
  □ Test all dashboard flows manually

Done when:
  ✓ Signup page works → user created
  ✓ Login page works → JWT stored
  ✓ Connections page → shows 4 apps
  ✓ Connect Gmail button → completes OAuth flow
  ✓ Gmail shows as Connected with email address
  ✓ Executions page → shows execution history
  ✓ Click execution → shows input/output
  ✓ API Keys page → create, copy, delete
  ✓ Logout → clears token → redirect to login
```

---

## Phase 8 — Agent (Days 17-18)

**Goal:** User can type a goal and AI executes multi-step tasks.

```
Tasks:
  □ Get free Gemini API key from aistudio.google.com
  □ Add GEMINI_API_KEY to .env (or DEFAULT_LLM_API_KEY)
  □ Implement agent service (21-agent-layer.md)
  □ Add agent routes
  □ Add agent page to dashboard
  □ Test multi-step goals

Done when:
  ✓ "List my unread emails" → agent calls LIST_EMAILS → returns summary
  ✓ "Send email to X about Y" → agent calls SEND_EMAIL → email sent
  ✓ "Find emails from john and create GitHub issues for urgent ones"
    → agent calls LIST_EMAILS, reads results, calls CREATE_ISSUE → issues created
  ✓ Agent run appears in agent_runs table with all steps
  ✓ Tool calls during agent run linked to agentRunId
```

---

## Phase 9 — Testing (Day 19)

**Goal:** All critical paths tested. No obvious bugs.

```
Tasks:
  □ Run Prompt 8.1 → integration tests
  □ Run all test checklists from each doc
  □ Test workspace isolation manually (two different accounts)
  □ Test token auto-refresh (wait for token to expire or manually set expiry)
  □ Test error scenarios (disconnect app mid-execution)

Critical Tests:
  □ Two users cannot see each other's data
  □ OAuth token never appears in any log
  □ API key shown only once
  □ Rate limiting works
  □ Retry logic works for 429 responses
```

---

## Phase 10 — Deploy (Day 20)

**Goal:** Platform hosted. Friends can use it.

```
Tasks:
  □ Create Neon database
  □ Create Upstash Redis
  □ Deploy backend to Railway
  □ Deploy frontend to Vercel
  □ Update all OAuth redirect URIs to production URLs
  □ Run migrations on production
  □ Full manual test on production URLs
  □ Share with friends

Done when:
  ✓ GET https://your-api.railway.app/v1/health → { status: "ok" }
  ✓ https://your-dashboard.vercel.app loads
  ✓ Full flow works on production (signup → connect Gmail → send email)
  ✓ Friends can sign up and use it
```

---

## Total Timeline

```
Day 1:       Phase 0 — Setup
Days 2-3:    Phase 1 — Auth
Days 4-6:    Phase 2 — OAuth
Day 7:       Phase 3 — Tool Registry
Days 8-10:   Phase 4 — Execution Engine ← MOST IMPORTANT
Days 11-12:  Phase 5 — More Connectors
Day 13:      Phase 6 — MCP Runtime
Days 14-16:  Phase 7 — Frontend
Days 17-18:  Phase 8 — Agent
Day 19:      Phase 9 — Testing
Day 20:      Phase 10 — Deploy

Total: 20 days
```

---

## If You Get Stuck

```
1. Read the relevant .md doc again
2. Check the test checklist — what exactly is failing?
3. Check Railway/local logs for error details
4. Use the AI prompt from 18-ai-prompts.md for that phase
5. Isolate the problem: is it the service, the route, or the DB?

Common issues:
  "Connection refused" → service not running
  "401 Unauthorized" → token issue in authenticate middleware
  "Encryption error" → ENCRYPTION_KEY not set or wrong format
  "OAuth callback error" → redirect URI mismatch (check all OAuth apps)
  "Tool not found" → connector not registered at startup
  "No tools returned" → app not connected (check connections table)
```

---

## What You'll Have After 20 Days

```
✓ Full OAuth infrastructure (Gmail, GitHub, Slack, Notion)
✓ Execution engine with retry, idempotency, rate limiting
✓ Tool registry with caching
✓ MCP server (Claude Code / Cursor compatible)
✓ Background job queue
✓ AI agent that can do multi-step tasks
✓ Clean dashboard
✓ Multi-tenant (multiple users, isolated workspaces)
✓ Production deployed
✓ Friends using it

Resume line:
"Built production AI integration platform with OAuth infrastructure,
 execution engine, MCP server, AI agent, and multi-tenant architecture.
 Supports Gmail, GitHub, Slack, Notion. Deployed and used by real users."

That's a jaw-dropping portfolio project.
```
