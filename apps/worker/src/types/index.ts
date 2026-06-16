export interface ExecutionJob {
  toolCallId: string;
  toolSlug: string;
  input: Record<string, unknown>;
  workspaceId: string;
  connectionId: string;
  accessToken: string;
}
