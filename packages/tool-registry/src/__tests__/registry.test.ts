import { describe, it, expect, beforeEach } from "vitest";
import { registerConnector, getTool, listTools, listToolsByConnector, getConnector, listConnectors } from "../registry/index.js";
import type { ConnectorDefinition } from "@nexus/connector-sdk";

const mockConnector: ConnectorDefinition = {
  name: "Test Connector",
  slug: "test",
  version: "1.0.0",
  auth: { type: "oauth2", authorizationUrl: "", tokenUrl: "", scopes: [] },
  actions: [
    {
      name: "Test Action",
      slug: "test_action",
      description: "A test action",
      category: "test",
      inputSchema: { parse: (v: unknown) => v } as any,
      execute: async () => ({ success: true }),
    },
  ],
};

describe("Tool Registry", () => {
  beforeEach(() => {
    // Clear registries by re-importing (module-level maps persist)
    // Since we can't easily clear module-level maps, we test with fresh registrations
  });

  it("registerConnector adds all actions to registry", () => {
    registerConnector(mockConnector);
    const tools = listToolsByConnector("test");
    expect(tools.length).toBe(1);
    expect(tools[0].slug).toBe("test_action");
  });

  it("getTool returns correct tool", () => {
    registerConnector(mockConnector);
    const tool = getTool("test_action");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("Test Action");
    expect(tool!.connectorSlug).toBe("test");
  });

  it("getTool returns undefined for unknown slug", () => {
    const tool = getTool("nonexistent_tool_xyz");
    expect(tool).toBeUndefined();
  });

  it("listTools returns all registered tools", () => {
    registerConnector(mockConnector);
    const tools = listTools();
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools.some((t) => t.slug === "test_action")).toBe(true);
  });

  it("listToolsByConnector filters correctly", () => {
    registerConnector(mockConnector);
    const tools = listToolsByConnector("test");
    expect(tools.every((t) => t.connectorSlug === "test")).toBe(true);
  });

  it("getConnector returns connector by slug", () => {
    registerConnector(mockConnector);
    const connector = getConnector("test");
    expect(connector).toBeDefined();
    expect(connector!.name).toBe("Test Connector");
  });

  it("listConnectors returns all registered connectors", () => {
    registerConnector(mockConnector);
    const connectors = listConnectors();
    expect(connectors.some((c) => c.slug === "test")).toBe(true);
  });
});
