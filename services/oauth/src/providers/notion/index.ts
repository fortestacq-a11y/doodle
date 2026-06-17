import type { OAuthProvider, TokenSet } from "../../types/index.js";

interface NotionTokenResponse {
  access_token: string;
  token_type?: string;
}

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID ?? "";
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET ?? "";

export const notionProvider: OAuthProvider = {
  name: "notion",
  config: {
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
  },

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: NOTION_CLIENT_ID,
      redirect_uri: `${process.env.API_URL}/v1/oauth/callback/notion`,
      response_type: "code",
      owner: "user",
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<TokenSet> {
    const auth = Buffer.from(
      `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
    ).toString("base64");
    const res = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.API_URL}/v1/oauth/callback/notion`,
      }),
    });
    if (!res.ok) throw new Error(`Notion token exchange failed: ${res.status}`);
    const data = (await res.json()) as NotionTokenResponse;
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
    };
  },

  async refreshToken(): Promise<TokenSet> {
    throw new Error("Notion tokens do not expire and cannot be refreshed");
  },
};
