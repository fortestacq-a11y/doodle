"use client";

import { useEffect, useState } from "react";

interface ApiKey {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState("");

  useEffect(() => {
    fetch("/api/api-keys")
      .then((r) => r.json())
      .then((data) => setApiKeys(data.keys ?? []))
      .catch(() => {});
  }, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    const data = await res.json();
    setCreatedKey(data.key ?? "");
    setNewKeyName("");
    setApiKeys((prev) => [...prev, { id: data.id, name: data.name, lastUsedAt: null, createdAt: data.createdAt }]);
  };

  const deleteKey = async (id: string) => {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">API Keys</h2>
        <p className="mt-1 text-sm text-gray-500">Manage programmatic access to your workspace.</p>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Key name (e.g. Production)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button onClick={createKey} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Create Key
          </button>
        </div>

        {createdKey && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">Your API key (shown once — copy it now):</p>
            <code className="mt-2 block break-all rounded bg-green-100 p-2 font-mono text-sm text-green-900">{createdKey}</code>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-lg border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Last Used</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {apiKeys.map((key) => (
                <tr key={key.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{key.name}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{new Date(key.createdAt).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <button onClick={() => deleteKey(key.id)} className="text-sm font-medium text-red-600 hover:text-red-800">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {apiKeys.length === 0 && <div className="p-6 text-sm text-gray-500">No API keys yet.</div>}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">MCP Configuration</h2>
        <div className="mt-3 rounded-lg border bg-gray-50 p-4">
          <p className="text-sm text-gray-600">Connect your AI agent to Nexus via MCP at:</p>
          <code className="mt-2 block rounded bg-white border p-3 font-mono text-sm">POST http://localhost:3001/v1/mcp/tools/call</code>
        </div>
      </section>
    </div>
  );
}
