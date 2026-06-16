import type { ActionContext } from "@nexus/connector-sdk";

interface CreatePageInput {
  title: string;
  content?: string;
  parentId?: string;
}

export async function createPage(
  input: CreatePageInput,
  ctx: ActionContext
): Promise<{ id: string; url: string }> {
  const parentId = input.parentId ?? (await searchForDefaultParent(ctx));
  if (!parentId) throw new Error("No parent page found. Provide parentId.");

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { page_id: parentId },
      properties: {
        title: [{ text: { content: input.title } }],
      },
      children: input.content
        ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: input.content } }] } }]
        : [],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion create page failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as any;
  return { id: data.id, url: data.url };
}

async function searchForDefaultParent(ctx: ActionContext): Promise<string | null> {
  const res = await fetch("https://api.notion.com/v1/search?filter=value=page&page_size=1", {
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  return data.results?.[0]?.id ?? null;
}
