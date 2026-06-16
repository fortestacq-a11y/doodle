import crypto from "crypto";
import { db } from "@nexus/database";

const SESSION_EXPIRY_HOURS = 24;

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.session.create({
    data: { userId, token, expiresAt },
  });

  return token;
}

export async function validateSession(token: string): Promise<AuthUser | null> {
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;
  if (new Date() > session.expiresAt) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } });
}

export async function verifyApiKey(rawKey: string): Promise<{ workspaceId: string } | null> {
  const keyHash = hashApiKey(rawKey);
  const key = await db.apiKey.findFirst({ where: { keyHash } });
  if (!key) return null;

  await db.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return { workspaceId: key.workspaceId };
}

export async function signup(email: string, name: string, password: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email already in use");

  const user = await db.user.create({ data: { email, name } });

  const workspace = await db.workspace.create({
    data: {
      name: `${name}'s Workspace`,
      ownerId: user.id,
    },
  });

  await db.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });

  const token = await createSession(user.id);

  return { user, workspace, token };
}

export async function login(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const token = await createSession(user.id);
  return { user, token };
}

export async function getUserWorkspaces(userId: string) {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
  });
  return memberships.map((m) => m.workspace);
}
