import type { FastifyInstance } from "fastify";
import { db } from "@nexus/database";

export async function executionRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const executions = await db.toolCall.findMany({
      where: { workspaceId: request.workspaceId },
      include: { tool: true },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return executions;
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const execution = await db.toolCall.findUnique({
      where: { id: request.params.id },
      include: { tool: true, input: true, output: true, errors: true },
    });
    if (!execution || execution.workspaceId !== request.workspaceId) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Execution not found" } });
    }
    return execution;
  });
}
