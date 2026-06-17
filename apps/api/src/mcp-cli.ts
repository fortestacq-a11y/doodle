#!/usr/bin/env node
import { NexusMcpServer } from "@nexus/mcp-runtime";
import { registerConnector } from "@nexus/tool-registry";
import { gmailConnector } from "@nexus/connectors/gmail/manifest.js";
import { githubConnector } from "@nexus/connectors/github/manifest.js";
import { slackConnector } from "@nexus/connectors/slack/manifest.js";
import { notionConnector } from "@nexus/connectors/notion/manifest.js";

registerConnector(gmailConnector);
registerConnector(githubConnector);
registerConnector(slackConnector);
registerConnector(notionConnector);

const server = new NexusMcpServer();
server.startStdio();
