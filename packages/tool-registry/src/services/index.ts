import { db } from "@nexus/database";
import { getTool, listTools } from "../registry/index.js";

export async function syncToolsToDatabase(): Promise<void> {
  const tools = listTools();

  for (const tool of tools) {
    let connector = await db.connector.findUnique({
      where: { slug: tool.connectorSlug },
    });

    if (!connector) {
      connector = await db.connector.create({
        data: { name: tool.connectorSlug, slug: tool.connectorSlug, version: tool.version },
      });
    }

    const dbTool = await db.tool.upsert({
      where: { slug: tool.slug },
      update: { description: tool.description, category: tool.category },
      create: {
        connectorId: connector.id,
        name: tool.name,
        slug: tool.slug,
        description: tool.description,
        category: tool.category,
      },
    });

    await db.toolVersion.upsert({
      where: { toolId_version: { toolId: dbTool.id, version: tool.version } },
      update: {},
      create: {
        toolId: dbTool.id,
        version: tool.version,
        schema: tool.inputSchema as Record<string, string>,
      },
    });
  }
}

export async function findToolWithSchema(slug: string) {
  const tool = await db.tool.findUnique({
    where: { slug },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return tool;
}
