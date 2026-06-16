import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { createLogger } from "@nexus/logger";
import { registerConnector } from "@nexus/tool-registry";
import { gmailConnector } from "@nexus/connectors/gmail/manifest.js";
import { githubConnector } from "@nexus/connectors/github/manifest.js";
import { slackConnector } from "@nexus/connectors/slack/manifest.js";
import { notionConnector } from "@nexus/connectors/notion/manifest.js";
import { executeToolJob } from "./workers/execute.js";

const log = createLogger("worker");

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
}) as any;

registerConnector(gmailConnector);
registerConnector(githubConnector);
registerConnector(slackConnector);
registerConnector(notionConnector);

export const executionQueue = new Queue("tool-executions", { connection });

const worker = new Worker(
  "tool-executions",
  async (job) => {
    log.info({ jobId: job.id, tool: job.data.tool }, "Processing execution job");
    return executeToolJob(job.data);
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => {
  log.info({ jobId: job.id }, "Job completed");
});

worker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, "Job failed");
});

log.info("Worker started, listening for jobs");
