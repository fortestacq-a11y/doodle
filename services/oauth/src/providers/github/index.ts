import type { OAuthProvider, TokenSet } from "../../types/index.js";

interface GitHubTokenResponse {
  access_token: string;
  token_type?: string;
}

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";

export const githubProvider: OAuthProvider = {
  name: "github",
  config: {
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user"],
  },

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: `${process.env.API_URL}/v1/oauth/callback/github`,
      scope: this.config.scopes.join(" "),
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<TokenSet> {
    const res = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.API_URL}/v1/oauth/callback/github`,
      }),
    });
    if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);
    const data = (await res.json()) as GitHubTokenResponse;
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
    };
  },

  async refreshToken(): Promise<TokenSet> {
    throw new Error("GitHub tokens do not expire and cannot be refreshed");
  },
};
