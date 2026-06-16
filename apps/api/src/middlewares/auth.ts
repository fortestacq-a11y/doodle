import type { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";

const PUBLIC_PATHS = ["/v1/health", "/v1/oauth/callback"];

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const url = request.url;

  if (PUBLIC_PATHS.some((p) => url.startsWith(p))) return;
  if (url === "/") return;

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Missing authorization header" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const db = await import("@nexus/database");
    const key = await db.db.apiKey.findFirst({
      where: { keyHash: tokenHash },
      include: { workspace: true },
    });

    if (key) {
      (request as any).workspaceId = key.workspaceId;
      (request as any).authType = "api_key";
      return;
    }

    const jwt = await import("@fastify/jwt");
    const decoded = (request.server as any).jwt.verify(token);
    if (decoded?.workspaceId) {
      (request as any).workspaceId = decoded.workspaceId;
      (request as any).userId = decoded.userId;
      (request as any).authType = "jwt";
      return;
    }

    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  } catch {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}
