import type { ActionContext } from "@nexus/connector-sdk";

interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body?: string;
}

interface GitHubIssueResponse {
  id: number;
  number: number;
  html_url: string;
  title: string;
}

export async function createIssue(
  input: CreateIssueInput,
  ctx: ActionContext
): Promise<GitHubIssueResponse> {
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

  const data = (await res.json()) as GitHubIssueResponse;
  return data;
}
