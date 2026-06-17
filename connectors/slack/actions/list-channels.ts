import type { ActionContext } from "@nexus/connector-sdk";

interface ChannelSummary {
  id: string;
  name: string;
  is_private: boolean;
}

interface SlackChannelListResponse {
  ok: boolean;
  channels: ChannelSummary[];
}

export async function listChannels(
  _input: Record<string, never>,
  ctx: ActionContext
): Promise<ChannelSummary[]> {
  const res = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel,private_channel",
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
  );
  const data = (await res.json()) as SlackChannelListResponse;
  if (!data.ok) throw new Error("Slack list channels failed");
  return data.channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    is_private: ch.is_private,
  }));
}
