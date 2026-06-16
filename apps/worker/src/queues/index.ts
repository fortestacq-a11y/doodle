import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
}) as any;

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
