# 06 — Environment Setup

## Complete .env.example

```bash
# ─────────────────────────────────────────
# APP
# ─────────────────────────────────────────
NODE_ENV=development
PORT=3001
API_URL=http://localhost:3001
DASHBOARD_URL=http://localhost:3000

# ─────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/nexus

# ─────────────────────────────────────────
# REDIS
# ─────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─────────────────────────────────────────
# SECURITY — GENERATE THESE, NEVER SHARE
# ─────────────────────────────────────────

# 32-byte hex key for AES-256-GCM token encryption
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=

# JWT secret for session tokens
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=

# ─────────────────────────────────────────
# GOOGLE OAUTH (Gmail + Google Calendar etc)
# Register at: console.cloud.google.com
# Create OAuth 2.0 credentials
# Add redirect URI: http://localhost:3001/v1/oauth/callback/google
# ─────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/v1/oauth/callback/google

# ─────────────────────────────────────────
# GITHUB OAUTH
# Register at: github.com/settings/developers
# Add callback URL: http://localhost:3001/v1/oauth/callback/github
# ─────────────────────────────────────────
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3001/v1/oauth/callback/github

# ─────────────────────────────────────────
# SLACK OAUTH
# Register at: api.slack.com/apps
# Add redirect URI: http://localhost:3001/v1/oauth/callback/slack
# ─────────────────────────────────────────
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:3001/v1/oauth/callback/slack

# ─────────────────────────────────────────
# NOTION OAUTH
# Register at: notion.so/my-integrations
# Add redirect URI: http://localhost:3001/v1/oauth/callback/notion
# ─────────────────────────────────────────
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=http://localhost:3001/v1/oauth/callback/notion
```

---

## How To Register Each OAuth App

### Google (Gmail)

1. Go to https://console.cloud.google.com
2. Create new project: "Nexus"
3. Go to APIs & Services → Enable APIs:
   - Gmail API
   - Google Calendar API (optional later)
4. Go to APIs & Services → Credentials
5. Create OAuth 2.0 Client ID
6. Application type: Web application
7. Name: "Nexus Local"
8. Authorized redirect URIs:
   - `http://localhost:3001/v1/oauth/callback/google` (dev)
   - `https://your-api.railway.app/v1/oauth/callback/google` (prod)
9. Copy Client ID and Client Secret to .env
10. Go to OAuth consent screen:
    - App name: "Nexus"
    - Add scopes: gmail.send, gmail.readonly, gmail.modify
    - Add test users: your email

### GitHub

1. Go to https://github.com/settings/developers
2. New OAuth App
3. Application name: "Nexus"
4. Homepage URL: `http://localhost:3000`
5. Callback URL: `http://localhost:3001/v1/oauth/callback/github`
6. Copy Client ID and Client Secret

### Slack

1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. App Name: "Nexus", select workspace
4. Go to OAuth & Permissions
5. Add Redirect URLs: `http://localhost:3001/v1/oauth/callback/slack`
6. Add Bot Token Scopes:
   - `channels:read`
   - `chat:write`
   - `users:read`
7. Copy Client ID and Client Secret

### Notion

1. Go to https://www.notion.so/my-integrations
2. New Integration
3. Name: "Nexus"
4. Associated workspace: your workspace
5. Capabilities: Read, Update, Insert content
6. Copy Integration Token (this is API key based, slightly different)

---

## Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/you/nexus
cd nexus
pnpm install

# 2. Copy env file
cp .env.example .env
# Fill in all values

# 3. Start local services
docker-compose up -d  # starts postgres + redis

# 4. Setup database
pnpm db:migrate:dev --name init
pnpm db:seed

# 5. Start development
pnpm dev  # starts all apps via turborepo
```

---

## Docker Compose (Local Only)

```yaml
# infrastructure/docker/docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: nexus
      POSTGRES_DB: nexus
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## Environment Per Stage

```
Local:
  DATABASE_URL → Docker postgres
  REDIS_URL → Docker redis
  API_URL → localhost:3001
  DASHBOARD_URL → localhost:3000

Staging:
  DATABASE_URL → Neon staging branch
  REDIS_URL → Upstash staging
  API_URL → staging-api.your-domain.com
  DASHBOARD_URL → staging.your-domain.com

Production:
  DATABASE_URL → Neon production branch
  REDIS_URL → Upstash production
  API_URL → api.your-domain.com
  DASHBOARD_URL → your-domain.com
  All OAuth redirect URIs → production URLs
```
