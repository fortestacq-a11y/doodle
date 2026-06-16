import type { FastifyInstance } from "fastify";
import { handleCallback, getAuthorizationUrl } from "@nexus/oauth";
import { db } from "@nexus/database";

export async function oauthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { connector: string; workspace_id: string } }>("/authorize", async (request, reply) => {
    const { connector, workspace_id } = request.query;
    const state = JSON.stringify({ connector, workspaceId: workspace_id });
    const url = getAuthorizationUrl(connector, state);
    return reply.redirect(url);
  });

  app.get<{ Querystring: { code: string; state: string } }>("/callback", async (request, reply) => {
    const { code, state: stateStr } = request.query;
    const state = JSON.parse(stateStr);
    await handleCallback(state.connector, code, state.workspaceId);
    const dashboardUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000";
    return reply.redirect(`${dashboardUrl}/connections?connected=${state.connector}`);
  });
}
