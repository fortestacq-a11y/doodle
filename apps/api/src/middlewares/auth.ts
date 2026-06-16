import type { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { db } from "@nexus/database";

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

    const key = await db.apiKey.findFirst({
      where: { keyHash: tokenHash },
    });

    if (key) {
      request.workspaceId = key.workspaceId;
      request.authType = "api_key";
      return;
    }

    const decoded = request.server.jwt.verify<{ workspaceId: string; userId: string }>(token);
    if (decoded?.workspaceId) {
      request.workspaceId = decoded.workspaceId;
      request.userId = decoded.userId;
      request.authType = "jwt";
      return;
    }

    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  } catch {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}
