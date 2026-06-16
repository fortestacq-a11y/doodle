import type { ActionContext } from "@nexus/connector-sdk";

interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

export async function sendEmail(
  input: SendEmailInput,
  ctx: ActionContext
): Promise<{ messageId: string; threadId: string }> {
  const { to, subject, body, cc } = input;

  const messageParts = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ]
    .filter(Boolean)
    .join("\r\n");

  const encodedMessage = Buffer.from(messageParts)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { id: string; threadId: string };
  return { messageId: data.id, threadId: data.threadId };
}
