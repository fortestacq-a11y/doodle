import type { FastifyInstance } from "fastify";
import { db } from "@nexus/database";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const memberships = await db.workspaceMember.findMany({
      where: { userId: request.userId ?? "" },
      include: { workspace: true },
    });
    return memberships.map((m) => m.workspace);
  });

  app.post<{ Body: { name: string } }>("/", async (request) => {
    const workspace = await db.workspace.create({
      data: {
        name: request.body.name,
        ownerId: request.userId ?? "",
        members: { create: { userId: request.userId ?? "", role: "owner" } },
      },
    });
    return workspace;
  });
}
