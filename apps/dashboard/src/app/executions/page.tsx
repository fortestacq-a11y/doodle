"use client";

import { useEffect, useState } from "react";

interface Execution {
  id: string;
  tool: { slug: string; name: string } | null;
  status: string;
  durationMs: number | null;
  startedAt: string;
}

const statusStyles: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-yellow-100 text-yellow-800",
  queued: "bg-gray-100 text-gray-800",
};

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);

  useEffect(() => {
    fetch("/api/executions")
      .then((r) => r.json())
      .then((data) => setExecutions(data.executions ?? []))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Executions</h1>
      <p className="mt-2 text-sm text-gray-500">History of tool executions across your workspace.</p>
      <div className="mt-6 overflow-hidden rounded-lg border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tool</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {executions.map((exec) => (
              <tr key={exec.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-gray-500">{exec.id.slice(0, 8)}</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm">{exec.tool?.name ?? exec.tool?.slug ?? "-"}</td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[exec.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {exec.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {exec.durationMs != null ? `${exec.durationMs}ms` : "-"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {new Date(exec.startedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {executions.length === 0 && <div className="p-6 text-sm text-gray-500">No executions yet.</div>}
      </div>
    </div>
  );
}
