import { gmailConnector } from "@nexus/connectors/gmail/manifest.js";
import { githubConnector } from "@nexus/connectors/github/manifest.js";
import { slackConnector } from "@nexus/connectors/slack/manifest.js";
import { notionConnector } from "@nexus/connectors/notion/manifest.js";
import { registerConnector } from "@nexus/tool-registry";

export function registerConnectors(): void {
  registerConnector(gmailConnector);
  registerConnector(githubConnector);
  registerConnector(slackConnector);
  registerConnector(notionConnector);
}
