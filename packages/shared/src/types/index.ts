export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type ConnectionStatus = "connected" | "expired" | "revoked" | "error";

export type ToolCallStatus = "queued" | "running" | "success" | "failed";

export type ConnectorSlug = "gmail" | "github" | "slack" | "notion";

export interface User {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
}

export interface Connection {
  id: string;
  workspaceId: string;
  connectorId: string;
  status: ConnectionStatus;
  connectedAt: Date;
  updatedAt: Date;
}

export interface Tool {
  id: string;
  connectorId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  createdAt: Date;
}

export interface ToolVersion {
  id: string;
  toolId: string;
  version: string;
  schema: Record<string, unknown>;
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  workspaceId: string;
  toolId: string;
  status: ToolCallStatus;
  durationMs?: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
