import { db } from "@nexus/database";
import { createLogger } from "@nexus/logger";
import { createSession, validateSession, deleteSession } from "@nexus/auth-sdk";
import crypto from "crypto";

const log = createLogger("auth");

export async function signup(email: string, name: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email already registered");

  const user = await db.user.create({ data: { email, name } });

  const workspace = await db.workspace.create({
    data: { name: `${name}'s Workspace`, ownerId: user.id },
  });

  await db.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });

  const token = await createSession(user.id);

  log.info({ userId: user.id }, "User signed up");
  return { user, workspace, token };
}

export async function login(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const token = await createSession(user.id);

  log.info({ userId: user.id }, "User logged in");
  return { user, token };
}

export async function logout(token: string) {
  await deleteSession(token);
}

export async function getAuthUser(token: string) {
  return validateSession(token);
}

export async function getUserWorkspaces(userId: string) {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
  });
  return memberships.map((m) => m.workspace);
}

export async function createApiKey(workspaceId: string, name: string) {
  const rawKey = `nx_live_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const key = await db.apiKey.create({
    data: { workspaceId, name, keyHash },
  });

  log.info({ workspaceId, keyName: name }, "API key created");
  return { id: key.id, name: key.name, key: rawKey };
}

export async function listApiKeys(workspaceId: string) {
  return db.apiKey.findMany({
    where: { workspaceId },
    select: { id: true, name: true, lastUsedAt: true, createdAt: true },
  });
}

export async function deleteApiKey(id: string) {
  await db.apiKey.delete({ where: { id } });
  log.info({ keyId: id }, "API key deleted");
}
