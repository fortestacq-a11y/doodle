import { getTool } from "@nexus/tool-registry";
import { db } from "@nexus/database";
import { createLogger } from "@nexus/logger";
import { generateId, type ToolCallStatus } from "@nexus/shared";
import {
  ExecutionError,
  ToolNotFoundError,
  ConnectorNotConnectedError,
  TimeoutError,
} from "../errors/index.js";

const log = createLogger("execution-engine");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const EXECUTION_TIMEOUT_MS = 30_000;

export interface ExecuteResult {
  executionId: string;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export async function executeTool(
  slug: string,
  input: Record<string, unknown>,
  workspaceId: string
): Promise<ExecuteResult> {
  const tool = getTool(slug);
  if (!tool) throw new ToolNotFoundError(slug);

  const startTime = Date.now();
  const executionId = generateId();

  const connection = await db.connection.findFirst({
    where: { workspaceId, connector: { slug: tool.connectorSlug } },
    include: { oauthToken: true },
  });

  if (!connection || connection.status !== "connected") {
    throw new ConnectorNotConnectedError(tool.connectorSlug);
  }

  const dbTool = await db.tool.findUnique({ where: { slug } });
  if (!dbTool) throw new ToolNotFoundError(slug);

  await db.toolCall.create({
    data: {
      id: executionId,
      workspaceId,
      toolId: dbTool.id,
      status: "running",
      startedAt: new Date(),
    },
  });

  await db.toolCallInput.create({
    data: { toolCallId: executionId, payload: input as never },
  });

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log.info({ slug, attempt, executionId }, "Executing tool");

      const result = await executeWithTimeout(
        async () =>
          tool.action.execute(input, {
            accessToken: connection.oauthToken!.accessToken,
            workspaceId,
            connectionId: connection.id,
          }),
        EXECUTION_TIMEOUT_MS
      );

      const durationMs = Date.now() - startTime;

      await db.toolCall.update({
        where: { id: executionId },
        data: { status: "success", durationMs, completedAt: new Date() },
      });

      await db.toolCallOutput.create({
        data: { toolCallId: executionId, payload: result as never },
      });

      log.info({ slug, executionId, durationMs }, "Tool execution succeeded");
      return { executionId, status: "success", result, durationMs };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const isRetryable =
        err instanceof ExecutionError
          ? err.retryable
          : isTransientError(err);

      if (attempt < MAX_RETRIES && isRetryable) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        log.warn({ slug, attempt, delay }, "Retrying failed execution");
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  const durationMs = Date.now() - startTime;
  const errorCode = lastError?.name ?? "UNKNOWN";
  const errorMessage = lastError?.message ?? "Unknown error";

  await db.toolCall.update({
    where: { id: executionId },
    data: { status: "failed", durationMs, completedAt: new Date() },
  });

  await db.executionError.create({
    data: { toolCallId: executionId, errorCode, errorMessage },
  });

  log.error({ slug, executionId, error: errorMessage }, "Tool execution failed");
  return { executionId, status: "failed", error: errorMessage, durationMs };
}

async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("tool", timeoutMs)), timeoutMs);
    fn()
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("econnrefused") || msg.includes("429") || msg.includes("503");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getExecution(executionId: string) {
  return db.toolCall.findUnique({
    where: { id: executionId },
    include: { tool: true, input: true, output: true, errors: true },
  });
}

export async function listExecutions(workspaceId: string, limit = 50, offset = 0) {
  const [executions, total] = await Promise.all([
    db.toolCall.findMany({
      where: { workspaceId },
      include: { tool: true },
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.toolCall.count({ where: { workspaceId } }),
  ]);
  return { executions, total };
}
