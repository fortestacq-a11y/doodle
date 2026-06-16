import { defineConnector, defineAction } from "@nexus/connector-sdk";
import { z } from "zod";
import { sendMessage } from "./actions/send-message.js";
import { listChannels } from "./actions/list-channels.js";

export const slackConnector = defineConnector({
  name: "Slack",
  slug: "slack",
  version: "1.0.0",
  auth: {
    type: "oauth2",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read"],
  },
  actions: [
    defineAction({
      name: "Send Message",
      slug: "slack_send_message",
      description: "Send a message to a Slack channel",
      category: "messaging",
      inputSchema: z.object({
        channel: z.string().min(1),
        text: z.string().min(1),
      }),
      execute: sendMessage,
    }),
    defineAction({
      name: "List Channels",
      slug: "slack_list_channels",
      description: "List Slack channels",
      category: "messaging",
      inputSchema: z.object({}),
      execute: listChannels,
    }),
  ],
});
