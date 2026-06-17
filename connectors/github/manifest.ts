import { defineConnector, defineAction } from "@nexus/connector-sdk";
import { z } from "zod";
import { createIssue } from "./actions/create-issue.js";
import { listPrs } from "./actions/list-prs.js";

export const githubConnector = defineConnector({
  name: "GitHub",
  slug: "github",
  version: "1.0.0",
  auth: {
    type: "oauth2",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo"],
  },
  actions: [
    defineAction({
      name: "Create Issue",
      slug: "github_create_issue",
      description: "Create a GitHub issue",
      category: "development",
      inputSchema: z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        title: z.string().min(1),
        body: z.string().optional(),
      }),
      execute: createIssue,
    }),
    defineAction({
      name: "List Pull Requests",
      slug: "github_list_pull_requests",
      description: "List pull requests for a repository",
      category: "development",
      inputSchema: z.object({
        owner: z.string().min(1),
        repo: z.string().min(1),
        state: z.enum(["open", "closed", "all"]).optional(),
      }),
      execute: listPrs,
    }),
  ],
});
