import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "@nexus/database";
import { getAuthorizationUrl, revokeConnection } from "@nexus/oauth";

export async function connectionRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const connections = await db.connection.findMany({
      where: { workspaceId: request.workspaceId },
      include: { connector: true },
    });
    return connections.map((c) => ({
      id: c.id,
      connector: c.connector.slug,
      status: c.status,
      connectedAt: c.connectedAt,
    }));
  });

  app.post<{ Body: { connector: string } }>("/connect", async (request, reply) => {
    if (!request.workspaceId) {
      return reply.status(400).send({ error: { code: "INVALID_REQUEST", message: "Missing workspace" } });
    }
    const { connector } = request.body;
    const state = crypto.randomUUID();
    const authorizationUrl = getAuthorizationUrl(connector, state);
    return { authorizationUrl, state };
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const connection = await db.connection.findUnique({ where: { id: request.params.id } });
    if (!connection || connection.workspaceId !== request.workspaceId) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Connection not found" } });
    }
    await revokeConnection(request.params.id);
    return { success: true };
  });
}
