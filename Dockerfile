# ─── API ──────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

# ─── API Builder ──────────────────────────────────────────────────────────────

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/logger/package.json packages/logger/
COPY packages/connector-sdk/package.json packages/connector-sdk/
COPY packages/tool-registry/package.json packages/tool-registry/
COPY packages/execution-engine/package.json packages/execution-engine/
COPY packages/mcp-runtime/package.json packages/mcp-runtime/
COPY packages/auth-sdk/package.json packages/auth-sdk/
COPY services/oauth/package.json services/oauth/
COPY services/connections/package.json services/connections/
COPY connectors/package.json connectors/

RUN pnpm install --frozen-lockfile

COPY . .

RUN turbo run build --filter=@nexus/api...

# ─── API Production ───────────────────────────────────────────────────────────

FROM base AS api
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/connectors ./connectors
COPY --from=builder /app/services ./services

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]

# ─── Dashboard Builder ────────────────────────────────────────────────────────

FROM base AS dashboard-builder
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY . .

ENV NEXT_PUBLIC_API_URL=http://localhost:3001
RUN turbo run build --filter=@nexus/dashboard...

# ─── Dashboard Production ─────────────────────────────────────────────────────

FROM base AS dashboard
WORKDIR /app

COPY --from=dashboard-builder /app/apps/dashboard/.next ./.next
COPY --from=dashboard-builder /app/apps/dashboard/public ./public
COPY --from=dashboard-builder /app/apps/dashboard/package.json ./package.json
COPY --from=dashboard-builder /app/apps/dashboard/next.config.mjs ./
COPY --from=dashboard-builder /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "node_modules/.bin/next", "start"]
