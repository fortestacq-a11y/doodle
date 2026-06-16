import { discoverAndRegisterConnectors } from "@nexus/tool-registry";
import { join } from "path";

export async function registerConnectors(): Promise<void> {
  const connectorsDir = join(__dirname, "../../../connectors");
  await discoverAndRegisterConnectors(connectorsDir);
}
