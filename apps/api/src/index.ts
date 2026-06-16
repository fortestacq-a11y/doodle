import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import { createLogger } from "@nexus/logger";
import { registerConnectors } from "./plugins/connectors.js";
import { authMiddleware } from "./middlewares/auth.js";
import { healthRoutes } from "./routes/health.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { connectionRoutes } from "./routes/connections.js";
import { toolRoutes } from "./routes/tools.js";
import { executionRoutes } from "./routes/executions.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { oauthRoutes } from "./routes/oauth.js";
import { mcpRoutes } from "./routes/mcp.js";

const log = createLogger("api");

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret" });

  registerConnectors();

  app.addHook("preHandler", authMiddleware);

  await app.register(healthRoutes, { prefix: "/v1" });
  await app.register(workspaceRoutes, { prefix: "/v1/workspaces" });
  await app.register(connectionRoutes, { prefix: "/v1/connections" });
  await app.register(toolRoutes, { prefix: "/v1/tools" });
  await app.register(executionRoutes, { prefix: "/v1/executions" });
  await app.register(apiKeyRoutes, { prefix: "/v1/api-keys" });
  await app.register(oauthRoutes, { prefix: "/v1/oauth" });
  await app.register(mcpRoutes, { prefix: "/v1/mcp" });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
  log.info({ port }, "API server started");
}

bootstrap().catch((err) => {
  log.error(err, "Failed to start API");
  process.exit(1);
});
