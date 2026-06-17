export const ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  CONNECTOR_NOT_CONNECTED: "CONNECTOR_NOT_CONNECTED",
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  EXECUTION_FAILED: "EXECUTION_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const CONNECTOR_SLUGS = ["gmail", "github", "slack", "notion"] as const;

export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;

export const CONNECTION_STATUSES = [
  "connected",
  "expired",
  "revoked",
  "error",
] as const;

export const TOOL_CALL_STATUSES = [
  "queued",
  "running",
  "success",
  "failed",
] as const;

export const API_VERSION = "v1";
export const DEFAULT_RATE_LIMIT = 100; // requests per minute
export const MAX_EXECUTION_TIMEOUT_MS = 30_000;
export const DEFAULT_RETRY_ATTEMPTS = 3;
