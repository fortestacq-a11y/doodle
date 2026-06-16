import { db } from "@nexus/database";
import { createLogger } from "@nexus/logger";
import { isExpired } from "@nexus/shared";
import { googleProvider } from "../providers/google/index.js";
import { githubProvider } from "../providers/github/index.js";
import { slackProvider } from "../providers/slack/index.js";
import { notionProvider } from "../providers/notion/index.js";
import type { OAuthProvider, TokenSet } from "../types/index.js";

const log = createLogger("oauth");

const providers: Record<string, OAuthProvider> = {
  gmail: googleProvider,
  github: githubProvider,
  slack: slackProvider,
  notion: notionProvider,
};

function getProvider(connectorSlug: string): OAuthProvider {
  const provider = providers[connectorSlug];
  if (!provider) throw new Error(`No OAuth provider for connector: ${connectorSlug}`);
  return provider;
}

export function getAuthorizationUrl(connectorSlug: string, state: string): string {
  return getProvider(connectorSlug).getAuthorizationUrl(state);
}

export async function handleCallback(
  connectorSlug: string,
  code: string,
  workspaceId: string
): Promise<void> {
  const provider = getProvider(connectorSlug);

  const tokenSet = await provider.exchangeCode(code);

  const connector = await db.connector.findUnique({
    where: { slug: connectorSlug },
  });
  if (!connector) throw new Error(`Connector not found: ${connectorSlug}`);

  const expiresAt = tokenSet.expiresIn
    ? new Date(Date.now() + tokenSet.expiresIn * 1000)
    : null;

  const existing = await db.connection.findFirst({
    where: { workspaceId, connectorId: connector.id },
  });

  let connection;
  if (existing) {
    connection = await db.connection.update({
      where: { id: existing.id },
      data: { status: "connected", updatedAt: new Date() },
    });
    await db.oAuthToken.update({
      where: { connectionId: connection.id },
      data: {
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken ?? null,
        expiresAt,
        tokenType: tokenSet.tokenType ?? "Bearer",
        updatedAt: new Date(),
      },
    });
  } else {
    connection = await db.connection.create({
      data: {
        workspaceId,
        connectorId: connector.id,
        status: "connected",
      },
    });
    await db.oAuthToken.create({
      data: {
        connectionId: connection.id,
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken ?? null,
        expiresAt,
        tokenType: tokenSet.tokenType ?? "Bearer",
      },
    });
  }

  log.info({ workspaceId, connectorSlug }, "OAuth connection created/updated");
}

export async function getAccessToken(
  workspaceId: string,
  connectorSlug: string
): Promise<string> {
  const connection = await db.connection.findFirst({
    where: { workspaceId, connector: { slug: connectorSlug } },
    include: { oauthToken: true, connector: true },
  });

  if (!connection || !connection.oauthToken) {
    throw new Error(`No connection found for ${connectorSlug} in workspace ${workspaceId}`);
  }

  if (connection.status !== "connected") {
    throw new Error(`Connection is ${connection.status}`);
  }

  if (connection.oauthToken.expiresAt && isExpired(connection.oauthToken.expiresAt)) {
    log.info({ connectorSlug, workspaceId }, "Token expired, refreshing");
    const provider = getProvider(connectorSlug);
    if (!connection.oauthToken.refreshToken) {
      throw new Error("Token expired and no refresh token available");
    }
    const refreshed = await provider.refreshToken(connection.oauthToken.refreshToken);
    const newExpiresAt = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : null;

    await db.oAuthToken.update({
      where: { connectionId: connection.id },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? connection.oauthToken.refreshToken,
        expiresAt: newExpiresAt,
        updatedAt: new Date(),
      },
    });

    return refreshed.accessToken;
  }

  return connection.oauthToken.accessToken;
}

export async function revokeConnection(connectionId: string): Promise<void> {
  await db.connection.update({
    where: { id: connectionId },
    data: { status: "revoked" },
  });
  log.info({ connectionId }, "Connection revoked");
}
