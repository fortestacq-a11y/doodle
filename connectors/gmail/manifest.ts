import { defineConnector, defineAction } from "@nexus/connector-sdk";
import { z } from "zod";
import { sendEmail } from "./actions/send-email.js";
import { listEmails } from "./actions/list-emails.js";

export const gmailConnector = defineConnector({
  name: "Gmail",
  slug: "gmail",
  version: "1.0.0",
  auth: {
    type: "oauth2",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://mail.google.com/", "https://www.googleapis.com/auth/gmail.readonly"],
  },
  actions: [
    defineAction({
      name: "Send Email",
      slug: "gmail_send_email",
      description: "Send an email via Gmail",
      category: "email",
      inputSchema: z.object({
        to: z.string().email(),
        subject: z.string().min(1),
        body: z.string().min(1),
        cc: z.string().email().optional(),
      }),
      execute: sendEmail,
    }),
    defineAction({
      name: "List Emails",
      slug: "gmail_list_emails",
      description: "List emails in Gmail inbox",
      category: "email",
      inputSchema: z.object({
        maxResults: z.number().optional(),
        query: z.string().optional(),
      }),
      execute: listEmails,
    }),
  ],
});
