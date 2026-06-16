import type { FastifyInstance } from "fastify";
import { db } from "@nexus/database";
import { getAuthorizationUrl, revokeConnection } from "@nexus/oauth";

export async function connectionRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const workspaceId = (request as any).workspaceId;
    const connections = await db.connection.findMany({
      where: { workspaceId },
      include: { connector: true },
    });
    return connections.map((c: any) => ({
      id: c.id,
      connector: c.connector.slug,
      status: c.status,
      connectedAt: c.connectedAt,
    }));
  });

  app.post<{ Body: { connector: string } }>("/connect", async (request, reply) => {
    const workspaceId = (request as any).workspaceId;
    if (!workspaceId) {
      return reply.status(400).send({ error: { code: "INVALID_REQUEST", message: "Missing workspace" } });
    }
    const { connector } = request.body;
    const state = crypto.randomUUID();
    const authorizationUrl = getAuthorizationUrl(connector, state);
    return { authorizationUrl, state };
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    await revokeConnection(request.params.id);
    return { success: true };
  });
}

import crypto from "crypto";
