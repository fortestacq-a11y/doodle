import { z } from "zod";

export const executeToolSchema = z.object({
  tool: z.string().min(1),
  arguments: z.record(z.unknown()),
  workspaceId: z.string().uuid().optional(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

export const connectSchema = z.object({
  connector: z.string().min(1),
});

export type ExecuteToolInput = z.infer<typeof executeToolSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type ConnectInput = z.infer<typeof connectSchema>;
