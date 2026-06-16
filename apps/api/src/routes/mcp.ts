import type { FastifyInstance } from "fastify";
import { handleListTools, handleCallTool } from "@nexus/mcp-runtime";

export async function mcpRoutes(app: FastifyInstance) {
  app.post("/tools/list", async () => {
    const tools = handleListTools();
    return { tools };
  });

  app.post<{ Body: { tool: string; arguments: Record<string, unknown> } }>(
    "/tools/call",
    async (request, reply) => {
      const { tool, arguments: args } = request.body;
      try {
        const result = await handleCallTool(tool, args, request.workspaceId);
        return { result };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool call failed";
        return reply.status(400).send({
          error: { code: "EXECUTION_FAILED", message },
          correlationId: request.correlationId,
        });
      }
    }
  );
}
