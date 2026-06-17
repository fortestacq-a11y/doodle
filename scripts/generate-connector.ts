#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const CONNECTORS_DIR = join(import.meta.dirname ?? __dirname, "..", "..", "connectors");

const name = process.argv[2];
if (!name) {
  console.error("Usage: pnpm generate:connector <name>");
  process.exit(1);
}

const slug = name.toLowerCase().replace(/\s+/g, "-");
const connectorDir = join(CONNECTORS_DIR, slug);

mkdirSync(join(connectorDir, "actions"), { recursive: true });
mkdirSync(join(connectorDir, "schemas"), { recursive: true });
mkdirSync(join(connectorDir, "tests"), { recursive: true });

writeFileSync(
  join(connectorDir, "manifest.ts"),
  `import { defineConnector, defineAction } from "@nexus/connector-sdk";
import { z } from "zod";

export const ${slug}Connector = defineConnector({
  name: "${name}",
  slug: "${slug}",
  version: "1.0.0",
  auth: {
    type: "oauth2",
    authorizationUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  actions: [
    defineAction({
      name: "Example Action",
      slug: "${slug}_example_action",
      description: "An example action for ${name}",
      category: "general",
      inputSchema: z.object({
        input: z.string().min(1),
      }),
      execute: async (input, ctx) => {
        return { success: true, data: input };
      },
    }),
  ],
});
`
);

writeFileSync(
  join(connectorDir, "auth.ts"),
  `// ${name} OAuth configuration
export const ${slug}Auth = {
  scopes: [],
  tokenUrl: "",
  authorizationUrl: "",
};
`
);

writeFileSync(
  join(connectorDir, "tests", "example.test.ts"),
  `import { ${slug}Connector } from "../manifest.js";

describe("${name} connector", () => {
  it("should have correct metadata", () => {
    expect(${slug}Connector.name).toBe("${name}");
    expect(${slug}Connector.slug).toBe("${slug}");
  });

  it("should have actions", () => {
    expect(${slug}Connector.actions.length).toBeGreaterThan(0);
  });
});
`
);

console.log(`Connector "${name}" created at connectors/${slug}/`);
console.log("  manifest.ts");
console.log("  auth.ts");
console.log("  actions/");
console.log("  schemas/");
console.log("  tests/");
