"use client";

import { useEffect, useState } from "react";

const CONNECTORS = [
  { slug: "gmail", name: "Gmail", color: "text-red-600", description: "Send emails, list inbox messages" },
  { slug: "github", name: "GitHub", color: "text-gray-900", description: "Create issues, list pull requests" },
  { slug: "slack", name: "Slack", color: "text-purple-600", description: "Send messages, list channels" },
  { slug: "notion", name: "Notion", color: "text-black", description: "Create pages, search content" },
];

interface Connection {
  id: string;
  connector: string;
  status: string;
  connectedAt: string;
}

const WORKSPACE_ID = "5fcdc1f0-e232-4a7b-83a1-debf30c740c0";

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  async function fetchConnections() {
    try {
      const res = await fetch("/api/connections", {
        headers: { "x-workspace-id": WORKSPACE_ID },
      });
      const data = await res.json();
      setConnections(Array.isArray(data) ? data : data.connections ?? []);
    } catch {
      setConnections([]);
    }
  }

  const isConnected = (slug: string) =>
    connections.some((c) => c.connector === slug && c.status === "connected");

  async function handleConnect(slug: string) {
    setLoading(slug);
    setError(null);
    try {
      const res = await fetch("/api/connections/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": WORKSPACE_ID,
          "Authorization": "Bearer nexus_test_key_12345",
        },
        body: JSON.stringify({ connector: slug }),
      });
      const data = await res.json();
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else if (data.error) {
        setError(data.error.message ?? "Failed to start connection");
      }
    } catch (err) {
      setError("Failed to connect. Check the API server.");
    } finally {
      setLoading(null);
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await fetch(`/api/connections/${id}`, {
        method: "DELETE",
        headers: {
          "x-workspace-id": WORKSPACE_ID,
          "Authorization": "Bearer nexus_test_key_12345",
        },
      });
      fetchConnections();
    } catch {
      setError("Failed to disconnect");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Connections</h1>
      <p className="mt-2 text-sm text-gray-500">
        Connect your applications to Nexus. Each connection gives AI agents access to that app&apos;s tools.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {CONNECTORS.map((c) => (
          <div key={c.slug} className="flex items-center justify-between rounded-lg border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${c.color}`}>{c.name}</span>
                  {isConnected(c.slug) ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Connected</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Not connected</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">{c.description}</p>
              </div>
            </div>
            <div>
              {isConnected(c.slug) ? (
                <button
                  onClick={() => {
                    const conn = connections.find((x) => x.connector === c.slug);
                    if (conn) handleDisconnect(conn.id);
                  }}
                  className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect(c.slug)}
                  disabled={loading === c.slug}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading === c.slug ? "Connecting..." : "Connect"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-dashed bg-gray-50 p-4">
        <p className="text-sm text-gray-600">
          <strong>How it works:</strong> Click &quot;Connect&quot; to start the OAuth flow. You&apos;ll be redirected to the provider (Gmail, GitHub, etc.) to authorize access. After approval, Nexus stores your credentials securely and your tools become available to AI agents.
        </p>
      </div>
    </div>
  );
}
