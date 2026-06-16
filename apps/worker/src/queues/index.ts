import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = { host: new URL(redisUrl).hostname, port: Number(new URL(redisUrl).port) || 6379 };

export const executionQueue = new Queue("tool-executions", { connection });

export async function enqueueExecution(job: {
  toolCallId: string;
  toolSlug: string;
  input: Record<string, unknown>;
  workspaceId: string;
  connectionId: string;
  accessToken: string;
}) {
  const result = await executionQueue.add("execute", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
  return result.id;
}
