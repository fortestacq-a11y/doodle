import type { OAuthProvider, TokenSet } from "../../types/index.js";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID ?? "";
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET ?? "";

export const slackProvider: OAuthProvider = {
  name: "slack",
  config: {
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read", "channels:history"],
  },

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      redirect_uri: `${process.env.API_URL}/v1/oauth/callback/slack`,
      scope: this.config.scopes.join(" "),
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<TokenSet> {
    const res = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        redirect_uri: `${process.env.API_URL}/v1/oauth/callback/slack`,
      }),
    });
    if (!res.ok) throw new Error(`Slack token exchange failed: ${res.status}`);
    const data = await res.json() as any;
    if (!data.ok) throw new Error(data.error);
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
    };
  },

  async refreshToken(): Promise<TokenSet> {
    throw new Error("Slack tokens do not expire and cannot be refreshed");
  },
};
