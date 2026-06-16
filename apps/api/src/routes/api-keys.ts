import type { FastifyInstance } from "fastify";
import { db } from "@nexus/database";
import crypto from "crypto";

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const workspaceId = (request as any).workspaceId;
    const keys = await db.apiKey.findMany({
      where: { workspaceId },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    });
    return keys;
  });

  app.post<{ Body: { name: string } }>("/", async (request, reply) => {
    const workspaceId = (request as any).workspaceId;
    const rawKey = `nx_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const key = await db.apiKey.create({
      data: { workspaceId, name: request.body.name, keyHash },
    });

    return reply.status(201).send({ id: key.id, name: key.name, key: rawKey });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    await db.apiKey.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}
