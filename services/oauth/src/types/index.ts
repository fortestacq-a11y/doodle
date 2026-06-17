export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

export interface OAuthProvider {
  name: string;
  config: OAuthConfig;
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;
}
