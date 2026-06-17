# 01 — Vision

## What You Are Building

Nexus is the backend infrastructure that sits between AI and the real world.

When a user says "send an email to John" — Nexus makes that happen.
When an agent says "create a GitHub issue" — Nexus makes that happen.
When a workflow says "post this to Slack" — Nexus makes that happen.

The AI never talks to Gmail directly.
The AI never sees OAuth tokens.
The AI only knows tool names.

Nexus handles everything else.

---

## The Exact Problem You Solve

Today if someone wants AI to send their emails:

```
Developer must:
  1. Register Google OAuth app
  2. Build OAuth flow
  3. Store tokens securely
  4. Refresh tokens when expired
  5. Handle Gmail API format
  6. Handle errors and retries
  7. Log executions
  8. Build this again for GitHub
  9. Build this again for Slack
  10. Build this again for every app
```

With Nexus:

```
Developer does:
  1. Call POST /connections/connect { appName: "gmail" }
  2. Done.

Nexus handles:
  - OAuth flow
  - Token storage
  - Token refresh
  - API calls
  - Error handling
  - Logging
  - For every app
```

---

## Who Uses Nexus

### Developers
Build AI agents that take real actions without building OAuth infrastructure.

### End Users (via apps built on Nexus)
Connect their Gmail, GitHub, Slack — then talk to AI to get things done.

---

## What Makes Nexus Different From Composio

| Feature | Composio | Nexus |
|---|---|---|
| You own the code | No | Yes |
| You own the data | No | Yes |
| Self-hostable | Partial | Yes |
| Customizable | No | Yes |
| Your OAuth branding | Paid plan | Yes |
| Your execution limits | Their limits | Your limits |

---

## The Core Insight

```
Composio's closed backend =
  OAuth Engine
  + Execution Engine
  + Tool Registry
  + Connector Runtime

Your Nexus =
  The exact same four things
  Built by you
  Owned by you
```

---

## Success Definition

Nexus is complete when:

1. User can sign up and create a workspace
2. User can connect Gmail via OAuth
3. AI can list emails via MCP
4. AI can send email via MCP
5. Every execution is logged and viewable
6. Token refresh happens automatically
7. Multiple users never see each other's data
8. GitHub and Slack connectors also work
9. Dashboard shows everything clearly
10. Can be deployed and shared with friends
