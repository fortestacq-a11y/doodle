import type { FastifyInstance } from "fastify";

async function checkDatabase(): Promise<{ status: string; latencyMs?: number }> {
  try {
    const start = Date.now();
    const { db } = await import("@nexus/database");
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    return { status: "error" };
  }
}

async function checkRedis(): Promise<{ status: string; latencyMs?: number }> {
  try {
    const start = Date.now();
    const net = await import("net");
    const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
    return await new Promise((resolve) => {
      const socket = net.createConnection(Number(url.port) || 6379, url.hostname);
      socket.setTimeout(2000);
      socket.on("connect", () => {
        socket.write("PING\r\n");
      });
      socket.on("data", (data) => {
        const response = data.toString();
        socket.destroy();
        if (response.includes("PONG")) {
          resolve({ status: "ok", latencyMs: Date.now() - start });
        } else {
          resolve({ status: "error" });
        }
      });
      socket.on("error", () => {
        socket.destroy();
        resolve({ status: "error" });
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ status: "error" });
      });
    });
  } catch {
    return { status: "error" };
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const healthy = database.status === "ok" && redis.status === "ok";
    return {
      status: healthy ? "healthy" : "degraded",
      checks: { database, redis },
      timestamp: new Date().toISOString(),
    };
  });
}
