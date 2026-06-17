"use client";

import { useEffect, useState } from "react";

interface Tool {
  name: string;
  connector: string;
  description: string;
  category: string;
  version: string;
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tools")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load tools");
        return r.json();
      })
      .then((data) => setTools(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading tools...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Tools</h1>
      <p className="mt-2 text-sm text-gray-500">Available tools across your connected applications.</p>
      <div className="mt-6 overflow-hidden rounded-lg border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tool</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Connector</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Version</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {tools.map((tool) => (
              <tr key={tool.name} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{tool.name}</div>
                  <div className="text-xs text-gray-500">{tool.description}</div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{tool.connector}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{tool.category}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{tool.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tools.length === 0 && <div className="p-6 text-sm text-gray-500">No tools available. Connect an app first.</div>}
      </div>
    </div>
  );
}
