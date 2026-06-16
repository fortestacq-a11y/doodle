import type { ConnectorDefinition, ActionDefinition } from "@nexus/connector-sdk";

export interface RegisteredTool {
  slug: string;
  name: string;
  description: string;
  category: string;
  connectorSlug: string;
  version: string;
  inputSchema: Record<string, unknown>;
  action: ActionDefinition;
}

// In-memory registry - connectors are registered at startup
const registry = new Map<string, RegisteredTool>();
const connectorRegistry = new Map<string, ConnectorDefinition>();

export function registerConnector(connector: ConnectorDefinition): void {
  connectorRegistry.set(connector.slug, connector);

  for (const action of connector.actions) {
    const tool: RegisteredTool = {
      slug: action.slug,
      name: action.name,
      description: action.description,
      category: action.category,
      connectorSlug: connector.slug,
      version: connector.version,
      inputSchema: (action.inputSchema as any)._def ?? {},
      action,
    };
    registry.set(action.slug, tool);
  }
}

export function getTool(slug: string): RegisteredTool | undefined {
  return registry.get(slug);
}

export function listTools(): RegisteredTool[] {
  return Array.from(registry.values());
}

export function listToolsByConnector(connectorSlug: string): RegisteredTool[] {
  return listTools().filter((t) => t.connectorSlug === connectorSlug);
}

export function getConnector(slug: string): ConnectorDefinition | undefined {
  return connectorRegistry.get(slug);
}

export function listConnectors(): ConnectorDefinition[] {
  return Array.from(connectorRegistry.values());
}
