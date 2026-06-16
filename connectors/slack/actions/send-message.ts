import type { ActionContext } from "@nexus/connector-sdk";

interface SendMessageInput {
  channel: string;
  text: string;
}

interface SlackMessageResponse {
  ok: boolean;
  ts: string;
  channel: string;
}

export async function sendMessage(
  input: SendMessageInput,
  ctx: ActionContext
): Promise<{ ok: boolean; ts: string; channel: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: input.channel, text: input.text }),
  });

  const data = (await res.json()) as SlackMessageResponse;
  if (!data.ok) throw new Error("Slack send failed");
  return data;
}
