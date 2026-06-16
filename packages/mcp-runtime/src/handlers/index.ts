import { listTools, getTool } from "@nexus/tool-registry";
import { executeTool } from "@nexus/execution-engine";
import type { McpTool } from "../types/index.js";

export function handleListTools(): McpTool[] {
  return listTools().map((t) => ({
    name: t.slug,
    description: t.description,
    inputSchema: {
      type: "object",
      properties: t.inputSchema,
    },
  }));
}

export async function handleCallTool(
  name: string,
  args: Record<string, unknown>,
  workspaceId: string
): Promise<unknown> {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  const result = await executeTool(name, args, workspaceId);
  if (result.status === "failed") {
    throw new Error(result.error ?? "Execution failed");
  }
  return result.result;
}
