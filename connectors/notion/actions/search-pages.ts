import type { ActionContext } from "@nexus/connector-sdk";

interface SearchResult {
  id: string;
  title: string;
  url: string;
  created_time: string;
}

interface NotionSearchResponse {
  results: SearchResult[];
}

interface NotionPageTitle {
  plain_text: string;
}

interface NotionPageProperties {
  title?: { title: NotionPageTitle[] };
  Name?: { title: NotionPageTitle[] };
}

export async function searchPages(
  input: { query: string },
  ctx: ActionContext
): Promise<Array<{ id: string; title: string; url: string; createdAt: string }>> {
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
  const data = (await res.json()) as NotionSearchResponse;

  return (data.results ?? []).map((page) => ({
    id: page.id,
    title: (page as unknown as { properties: NotionPageProperties }).properties?.title?.title?.[0]?.plain_text ?? "",
    url: page.url,
    createdAt: page.created_time,
  }));
}
