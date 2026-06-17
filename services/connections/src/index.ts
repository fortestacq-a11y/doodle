import { db } from "@nexus/database";
import { createLogger } from "@nexus/logger";

const log = createLogger("connections");

export interface ConnectionInfo {
  id: string;
  connector: string;
  status: string;
  connectedAt: Date;
  updatedAt: Date;
}

export async function listConnections(workspaceId: string): Promise<ConnectionInfo[]> {
  const connections = await db.connection.findMany({
    where: { workspaceId },
    include: { connector: true },
  });
  return connections.map((c) => ({
    id: c.id,
    connector: c.connector.slug,
    status: c.status,
    connectedAt: c.connectedAt,
    updatedAt: c.updatedAt,
  }));
}

export async function getConnection(workspaceId: string, connectorSlug: string) {
  const connection = await db.connection.findFirst({
    where: { workspaceId, connector: { slug: connectorSlug } },
    include: { connector: true, oauthToken: true },
  });
  return connection;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await db.connection.delete({
    where: { id: connectionId },
    include: { oauthToken: true },
  });
  log.info({ connectionId }, "Connection deleted");
}

export async function getConnectionStatus(workspaceId: string, connectorSlug: string): Promise<string> {
  const connection = await getConnection(workspaceId, connectorSlug);
  if (!connection) return "disconnected";
  if (connection.oauthToken?.expiresAt && new Date() > connection.oauthToken.expiresAt) {
    return "expired";
  }
  return connection.status;
}

export async function countConnections(workspaceId: string): Promise<number> {
  return db.connection.count({ where: { workspaceId } });
}
