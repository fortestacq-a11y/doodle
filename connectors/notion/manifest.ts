import { defineConnector, defineAction } from "@nexus/connector-sdk";
import { z } from "zod";
import { createPage } from "./actions/create-page.js";
import { searchPages } from "./actions/search-pages.js";

export const notionConnector = defineConnector({
  name: "Notion",
  slug: "notion",
  version: "1.0.0",
  auth: {
    type: "oauth2",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
  },
  actions: [
    defineAction({
      name: "Create Page",
      slug: "notion_create_page",
      description: "Create a Notion page",
      category: "productivity",
      inputSchema: z.object({
        title: z.string().min(1),
        content: z.string().optional(),
        parentId: z.string().optional(),
      }),
      execute: createPage,
    }),
    defineAction({
      name: "Search Pages",
      slug: "notion_search_pages",
      description: "Search Notion pages",
      category: "productivity",
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: searchPages,
    }),
  ],
});
