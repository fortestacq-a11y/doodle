import { Queue, Worker } from "bullmq";
import { createLogger } from "@nexus/logger";
import { discoverAndRegisterConnectors } from "@nexus/tool-registry";
import { executeToolJob } from "./workers/execute.js";
import { join } from "path";

const log = createLogger("worker");

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = { host: new URL(redisUrl).hostname, port: Number(new URL(redisUrl).port) || 6379 };

async function bootstrap() {
  const connectorsDir = join(__dirname, "../../../connectors");
  await discoverAndRegisterConnectors(connectorsDir);

  const executionQueue = new Queue("tool-executions", { connection });

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

  async function shutdown() {
    log.info("Shutting down worker");
    await worker.close();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  log.info("Worker started, listening for jobs");
}

bootstrap();
