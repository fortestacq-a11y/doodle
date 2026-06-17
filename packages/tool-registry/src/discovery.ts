import { readdirSync } from "fs";
import { join } from "path";
import { registerConnector, type RegisteredTool } from "./registry/index.js";
import type { ConnectorDefinition } from "@nexus/connector-sdk";

export async function discoverAndRegisterConnectors(connectorsDir: string): Promise<void> {
  const dirs = readdirSync(connectorsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    try {
      const manifestPath = join(connectorsDir, dir, "manifest.js");
      const mod = await import(manifestPath);
      const connectorExport = Object.values(mod).find(
        (v: unknown) =>
          v !== null &&
          typeof v === "object" &&
          "slug" in (v as Record<string, unknown>) &&
          "actions" in (v as Record<string, unknown>)
      ) as ConnectorDefinition | undefined;
      if (connectorExport) {
        registerConnector(connectorExport);
      }
    } catch (err) {
      console.error(`Failed to load connector: ${dir}`, err);
    }
  }
}

export { registerConnector, type RegisteredTool };
