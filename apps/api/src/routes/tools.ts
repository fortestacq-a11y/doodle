import type { FastifyInstance } from "fastify";
import { db } from "@nexus/database";
import { executeTool } from "@nexus/execution-engine";

export async function toolRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const tools = await db.tool.findMany({
      include: { connector: true, versions: true },
    });
    return tools.map((t) => ({
      name: t.slug,
      connector: t.connector.slug,
      description: t.description,
      category: t.category,
      version: t.versions[0]?.version,
    }));
  });

  app.get<{ Params: { tool: string } }>("/:tool", async (request, reply) => {
    const tool = await db.tool.findUnique({
      where: { slug: request.params.tool },
      include: { connector: true, versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!tool) return reply.status(404).send({ error: { code: "TOOL_NOT_FOUND", message: "Tool not found" } });
    return tool;
  });

  app.post<{ Body: { tool: string; arguments: Record<string, unknown> } }>("/execute", async (request, reply) => {
    const { tool, arguments: args } = request.body;
    try {
      const result = await executeTool(tool, args, request.workspaceId);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(400).send({ error: { code: "EXECUTION_FAILED", message } });
    }
  });
}
