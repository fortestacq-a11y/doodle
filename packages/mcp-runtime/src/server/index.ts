import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleListTools, handleCallTool } from "../handlers/index.js";
import { createSession, getSession } from "../sessions/index.js";
import { createLogger } from "@nexus/logger";

const log = createLogger("mcp-runtime");

export class NexusMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "nexus",
      version: "1.0.0",
    });
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.tool(
      "nexus_list_tools",
      "List all available tools across all connected connectors",
      {},
      async () => {
        const tools = handleListTools();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(tools, null, 2),
            },
          ],
        };
      }
    );

    this.server.tool(
      "nexus_execute_tool",
      "Execute a tool by name with arguments",
      {
        tool: z.string().describe("The tool slug to execute"),
        arguments: z
          .record(z.unknown())
          .describe("Arguments to pass to the tool"),
        workspaceId: z
          .string()
          .describe("The workspace ID to execute in"),
      },
      async ({ tool, arguments: args, workspaceId }) => {
        try {
          const result = await handleCallTool(tool, args, workspaceId);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: message }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info("MCP server started on stdio");
  }

  getServer(): McpServer {
    return this.server;
  }
}
