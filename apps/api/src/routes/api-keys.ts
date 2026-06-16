import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "@nexus/database";

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const keys = await db.apiKey.findMany({
      where: { workspaceId: request.workspaceId },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    });
    return keys;
  });

  app.post<{ Body: { name: string } }>("/", async (request) => {
    const rawKey = `nx_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const key = await db.apiKey.create({
      data: { workspaceId: request.workspaceId, name: request.body.name, keyHash },
    });

    return { id: key.id, name: key.name, key: rawKey };
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const key = await db.apiKey.findUnique({ where: { id: request.params.id } });
    if (!key || key.workspaceId !== request.workspaceId) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "API key not found" } });
    }
    await db.apiKey.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}
