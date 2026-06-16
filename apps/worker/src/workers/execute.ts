import { db } from "@nexus/database";
import { getTool } from "@nexus/tool-registry";
import { createLogger } from "@nexus/logger";
import type { ExecutionJob } from "../types/index.js";

const log = createLogger("worker-execute");

export async function executeToolJob(job: ExecutionJob): Promise<unknown> {
  const { toolCallId, toolSlug, input, workspaceId, connectionId, accessToken } = job;

  await db.toolCall.update({
    where: { id: toolCallId },
    data: { status: "running" },
  });

  const tool = getTool(toolSlug);
  if (!tool) {
    await db.toolCall.update({
      where: { id: toolCallId },
      data: { status: "failed", completedAt: new Date() },
    });
    await db.executionError.create({
      data: {
        toolCallId,
        errorCode: "TOOL_NOT_FOUND",
        errorMessage: `Tool not found: ${toolSlug}`,
      },
    });
    throw new Error(`Tool not found: ${toolSlug}`);
  }

  const startTime = Date.now();
  try {
    const result = await tool.action.execute(input, {
      accessToken,
      workspaceId,
      connectionId,
    });

    const durationMs = Date.now() - startTime;

    await db.toolCall.update({
      where: { id: toolCallId },
      data: { status: "success", durationMs, completedAt: new Date() },
    });

    await db.toolCallOutput.create({
      data: { toolCallId, payload: result as never },
    });

    log.info({ toolCallId, durationMs }, "Execution succeeded");
    return result;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await db.toolCall.update({
      where: { id: toolCallId },
      data: { status: "failed", durationMs, completedAt: new Date() },
    });

    await db.executionError.create({
      data: { toolCallId, errorCode: "EXECUTION_FAILED", errorMessage },
    });

    log.error({ toolCallId, error: errorMessage }, "Execution failed");
    throw err;
  }
}
