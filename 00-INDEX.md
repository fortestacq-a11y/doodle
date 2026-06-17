# Nexus — Complete Build Documentation

## What Is Nexus

Nexus is a fully functional, production-grade AI integration backend.
It does exactly what Composio does — but you own every line of code.

Users connect their apps (Gmail, GitHub, Slack, Notion).
AI agents can then read, write, and act on those apps.
Everything is secure, auditable, and multi-tenant.

---

## All Documents

### Understand First
- `01-vision.md`           — What you're building and why
- `02-architecture.md`     — How all 8 systems connect
- `03-system-flow.md`      — Step by step: connect Gmail, AI sends email

### Foundation
- `04-database.md`         — Complete Prisma schema with encryption
- `05-folder-structure.md` — Exact monorepo layout
- `06-environment.md`      — All env vars, OAuth app registration

### Core Backend
- `07-auth-system.md`      — Signup, login, JWT, API keys, rate limiting
- `08-oauth-system.md`     — OAuth flows, token storage, auto-refresh
- `09-tool-registry.md`    — Tool discovery, caching, workspace filtering
- `10-execution-engine.md` — Validate, execute, retry, log — the heart
- `11-connector-sdk.md`    — Framework for building connectors
- `12-mcp-runtime.md`      — MCP protocol server for AI clients

### Connectors
- `13-connector-gmail.md`              — Gmail: send, list, search, reply
- `14-connectors-github-slack-notion.md` — GitHub, Slack, Notion

### API & Security
- `15-api-security-errors.md` — Every endpoint, error code, security rule

### Frontend
- `16-frontend.md`         — Next.js dashboard: connections, executions, keys

### Operations
- `17-testing-deployment.md` — Tests + Railway/Vercel/Neon/Upstash deploy
- `19-observability.md`    — Logging, metrics, health check, alerts
- `20-worker-queue.md`     — BullMQ background jobs, token refresh worker

### Agent Layer
- `21-agent-layer.md`      — Multi-step AI agent, Gemini/OpenAI/Groq support

### Build Guide
- `18-ai-prompts.md`       — Exact prompts to give AI to build each system
- `22-build-roadmap.md`    — Day by day plan, 20 days to production

---

## Build Order (Strict)

```
Day 1     → 00 Setup (monorepo + database + encryption)
Days 2-3  → 07 Auth system
Days 4-6  → 08 OAuth system
Day 7     → 09 Tool registry + 11 Connector SDK
Days 8-10 → 10 Execution Engine ← MOST IMPORTANT
Days 11-12→ 13+14 All connectors
Day 13    → 12 MCP runtime
Days 14-16→ 16 Frontend dashboard
Days 17-18→ 21 Agent layer
Day 19    → 17 Testing
Day 20    → 17 Deploy
```

## Golden Rules (Never Break)

```
1. Connectors NEVER touch OAuth tokens directly
2. ALL executions go through Execution Engine
3. Tool discovery ONLY from Tool Registry
4. Every execution MUST be logged
5. Every workspace MUST be isolated
6. Tokens NEVER appear in logs or LLM context
7. API keys stored as hashes ONLY
8. Every action MUST be idempotent-safe
```

## Tech Stack

```
Language:     TypeScript (everything)
Framework:    Fastify (API) + Next.js (dashboard)
ORM:          Prisma
Database:     PostgreSQL (Neon — free)
Cache/Queue:  Redis (Upstash — free)
Auth:         Better Auth + JWT
Agent LLM:    Gemini Flash (free, 1M tokens/day)
Deployment:   Railway (backend) + Vercel (frontend)
Package Mgr:  pnpm + Turborepo
```
