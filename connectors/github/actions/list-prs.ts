import type { ActionContext } from "@nexus/connector-sdk";

interface ListPrsInput {
  owner: string;
  repo: string;
  state?: string;
}

interface PrSummary {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
}

export async function listPrs(
  input: ListPrsInput,
  ctx: ActionContext
): Promise<PrSummary[]> {
  const params = new URLSearchParams();
  if (input.state) params.set("state", input.state);

  const res = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub list PRs failed: ${res.status} ${err}`);
  }

  return (await res.json()) as PrSummary[];
}
