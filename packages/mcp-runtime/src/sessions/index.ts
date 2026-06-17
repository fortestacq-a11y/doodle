import type { SessionData } from "../types/index.js";

const sessions = new Map<string, SessionData>();

export function createSession(sessionId: string, workspaceId: string): SessionData {
  const session: SessionData = {
    sessionId,
    workspaceId,
    createdAt: new Date(),
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listSessions(): SessionData[] {
  return Array.from(sessions.values());
}
