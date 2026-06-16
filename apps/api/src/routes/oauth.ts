import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import { handleCallback, getAuthorizationUrl } from "@nexus/oauth";

export async function oauthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { connector: string } }>("/authorize", async (request, reply) => {
    const { connector } = request.query;
    if (!connector || !/^[a-z]+$/.test(connector)) {
      return reply.status(400).send({ error: { code: "INVALID_REQUEST", message: "Invalid connector name" } });
    }
    const stateToken = crypto.randomBytes(32).toString("hex");
    const state = JSON.stringify({ connector, workspaceId: request.workspaceId, stateToken });
    const url = getAuthorizationUrl(connector, state);
    return reply.redirect(url);
  });

  app.get<{ Querystring: { code: string; state: string } }>("/callback", async (request, reply) => {
    const { code, state: stateStr } = request.query;
    try {
      const state = JSON.parse(stateStr);
      if (!state.connector || !state.workspaceId) {
        throw new Error("Invalid OAuth state");
      }
      await handleCallback(state.connector, code, state.workspaceId);
      const dashboardUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";
      return reply.redirect(`${dashboardUrl}/connections?connected=${state.connector}`);
    } catch {
      const dashboardUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";
      return reply.redirect(`${dashboardUrl}/connections?error=connection_failed`);
    }
  });
}
