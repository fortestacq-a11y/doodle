import type { ActionContext } from "@nexus/connector-sdk";

interface ChannelSummary {
  id: string;
  name: string;
  isPrivate: boolean;
}

export async function listChannels(
  _input: {},
  ctx: ActionContext
): Promise<ChannelSummary[]> {
  const res = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel,private_channel",
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
  );
  const data = (await res.json()) as any;
  if (!data.ok) throw new Error(`Slack list channels failed: ${data.error}`);
  return data.channels.map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    isPrivate: ch.is_private,
  }));
}
