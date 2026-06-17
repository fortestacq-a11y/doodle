import { z } from "zod";

export interface OAuthConfig {
  type: "oauth2";
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId?: string;
  clientSecret?: string;
}

export interface ActionContext {
  accessToken: string;
  workspaceId: string;
  connectionId: string;
}

export interface ActionDefinition<
  TInput = Record<string, unknown>,
  TOutput = Record<string, unknown>,
> {
  name: string;
  slug: string;
  description: string;
  category: string;
  inputSchema: z.ZodSchema<TInput>;
  execute: (input: TInput, ctx: ActionContext) => Promise<TOutput>;
}

export interface ConnectorDefinition {
  name: string;
  slug: string;
  version: string;
  auth: OAuthConfig;
  actions: ActionDefinition<any, any>[];
}

export function defineConnector(config: ConnectorDefinition): ConnectorDefinition {
  return config;
}

export function defineAction<TInput, TOutput>(
  config: ActionDefinition<TInput, TOutput>
): ActionDefinition<TInput, TOutput> {
  return config;
}
