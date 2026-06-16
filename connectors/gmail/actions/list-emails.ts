import type { ActionContext } from "@nexus/connector-sdk";

interface ListEmailsInput {
  maxResults?: number;
  query?: string;
}

interface EmailSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
}

export async function listEmails(
  input: ListEmailsInput,
  ctx: ActionContext
): Promise<EmailSummary[]> {
  const params = new URLSearchParams();
  if (input.maxResults) params.set("maxResults", String(input.maxResults));
  if (input.query) params.set("q", input.query);

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
  );

  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
  const listData = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };

  if (!listData.messages) return [];

  const emails = await Promise.all(
    listData.messages.map(async (msg) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`,
        {
          headers: {
            Authorization: `Bearer ${ctx.accessToken}`,
          },
        }
      );
      if (!msgRes.ok) return null;
      const msgData = (await msgRes.json()) as any;
      const headers = msgData.payload?.headers ?? [];
      const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "";
      const from = headers.find((h: any) => h.name === "From")?.value ?? "";
      const date = headers.find((h: any) => h.name === "Date")?.value ?? "";
      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: msgData.snippet ?? "",
        subject,
        from,
        date,
      };
    })
  );

  return emails.filter(Boolean) as EmailSummary[];
}
