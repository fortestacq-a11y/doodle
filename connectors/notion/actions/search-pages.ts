import type { ActionContext } from "@nexus/connector-sdk";

interface SearchResult {
  id: string;
  title: string;
  url: string;
  createdAt: string;
}

export async function searchPages(
  input: { query: string },
  ctx: ActionContext
): Promise<SearchResult[]> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      filter: { value: "page", property: "object" },
    }),
  });

  if (!res.ok) throw new Error(`Notion search failed: ${res.status}`);
  const data = (await res.json()) as any;

  return (data.results ?? []).map((page: any) => ({
    id: page.id,
    title:
      page.properties?.title?.title?.[0]?.plain_text ??
      page.properties?.Name?.title?.[0]?.plain_text ??
      "",
    url: page.url,
    createdAt: page.created_time,
  }));
}
