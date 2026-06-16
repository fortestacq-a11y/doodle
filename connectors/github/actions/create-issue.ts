import type { ActionContext } from "@nexus/connector-sdk";

interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
}

export async function createIssue(
  input: CreateIssueInput,
  ctx: ActionContext
): Promise<{ id: number; number: number; htmlUrl: string; title: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: input.title, body: input.body ?? "" }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub create issue failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as any;
  return {
    id: data.id,
    number: data.number,
    htmlUrl: data.html_url,
    title: data.title,
  };
}
