import { db } from "./index.js";

async function seed() {
  console.log("Seeding database...");

  // Seed connectors
  const connectors = [
    { name: "Gmail", slug: "gmail", version: "1.0.0" },
    { name: "GitHub", slug: "github", version: "1.0.0" },
    { name: "Slack", slug: "slack", version: "1.0.0" },
    { name: "Notion", slug: "notion", version: "1.0.0" },
  ];

  for (const connector of connectors) {
    await db.connector.upsert({
      where: { slug: connector.slug },
      update: {},
      create: connector,
    });
  }

  const gmailConnector = await db.connector.findUnique({ where: { slug: "gmail" } });
  const githubConnector = await db.connector.findUnique({ where: { slug: "github" } });
  const slackConnector = await db.connector.findUnique({ where: { slug: "slack" } });
  const notionConnector = await db.connector.findUnique({ where: { slug: "notion" } });

  const tools = [
    {
      connectorId: gmailConnector!.id,
      name: "Send Email",
      slug: "gmail_send_email",
      description: "Send an email via Gmail",
      category: "email",
      schema: { to: "string", subject: "string", body: "string" },
    },
    {
      connectorId: gmailConnector!.id,
      name: "List Emails",
      slug: "gmail_list_emails",
      description: "List emails in Gmail inbox",
      category: "email",
      schema: { maxResults: "number", query: "string" },
    },
    {
      connectorId: githubConnector!.id,
      name: "Create Issue",
      slug: "github_create_issue",
      description: "Create a GitHub issue",
      category: "development",
      schema: { repo: "string", title: "string", body: "string" },
    },
    {
      connectorId: githubConnector!.id,
      name: "List Pull Requests",
      slug: "github_list_pull_requests",
      description: "List pull requests for a repository",
      category: "development",
      schema: { repo: "string", state: "string" },
    },
    {
      connectorId: slackConnector!.id,
      name: "Send Message",
      slug: "slack_send_message",
      description: "Send a message to a Slack channel",
      category: "messaging",
      schema: { channel: "string", text: "string" },
    },
    {
      connectorId: slackConnector!.id,
      name: "List Channels",
      slug: "slack_list_channels",
      description: "List Slack channels",
      category: "messaging",
      schema: {},
    },
    {
      connectorId: notionConnector!.id,
      name: "Create Page",
      slug: "notion_create_page",
      description: "Create a Notion page",
      category: "productivity",
      schema: { title: "string", content: "string", parentId: "string" },
    },
    {
      connectorId: notionConnector!.id,
      name: "Search Pages",
      slug: "notion_search_pages",
      description: "Search Notion pages",
      category: "productivity",
      schema: { query: "string" },
    },
  ];

  for (const tool of tools) {
    const { schema, ...toolData } = tool;
    const created = await db.tool.upsert({
      where: { slug: tool.slug },
      update: {},
      create: toolData,
    });

    await db.toolVersion.upsert({
      where: { toolId_version: { toolId: created.id, version: "1.0.0" } },
      update: {},
      create: { toolId: created.id, version: "1.0.0", schema },
    });
  }

  console.log("Seed complete.");
  await db.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
