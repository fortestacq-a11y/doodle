"use client";

import { useEffect, useState } from "react";

const WORKSPACE_ID = "5fcdc1f0-e232-4a7b-83a1-debf30c740c0";

interface Stats {
  connections: number;
  tools: number;
  executionsToday: number;
  totalExecutions: number;
}

interface RecentExecution {
  id: string;
  tool: { slug: string; name: string } | null;
  status: string;
  startedAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ connections: 0, tools: 0, executionsToday: 0, totalExecutions: 0 });
  const [recent, setRecent] = useState<RecentExecution[]>([]);

  useEffect(() => {
    const headers = { Authorization: "Bearer nexus_test_key_12345" };
    Promise.all([
      fetch("/api/connections", { headers }).then((r) => r.json()).catch(() => []),
      fetch("/api/tools", { headers }).then((r) => r.json()).catch(() => []),
      fetch("/api/executions", { headers }).then((r) => r.json()).catch(() => []),
    ]).then(([connData, toolData, execData]) => {
      const connections = Array.isArray(connData) ? connData : [];
      const tools = Array.isArray(toolData) ? toolData : [];
      const executions = Array.isArray(execData) ? execData : [];
      const today = new Date().toDateString();
      setStats({
        connections: connections.length,
        tools: tools.length,
        totalExecutions: executions.length,
        executionsToday: executions.filter((e: { startedAt: string }) => new Date(e.startedAt).toDateString() === today).length,
      });
      setRecent(executions.slice(0, 5));
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Overview of your Nexus workspace.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Connections" value={String(stats.connections)} color="text-blue-600" />
        <StatCard title="Tools Available" value={String(stats.tools)} color="text-purple-600" />
        <StatCard title="Executions Today" value={String(stats.executionsToday)} color="text-green-600" />
        <StatCard title="Total Executions" value={String(stats.totalExecutions)} color="text-orange-600" />
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recent Executions</h2>
        {recent.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Tool</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {recent.map((ex) => (
                  <tr key={ex.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">{ex.tool?.name ?? ex.tool?.slug}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        ex.status === "success" ? "bg-green-100 text-green-800" :
                        ex.status === "failed" ? "bg-red-100 text-red-800" :
                        "bg-yellow-100 text-yellow-800"
                      }`}>{ex.status}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{new Date(ex.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed bg-gray-50 p-8 text-center text-sm text-gray-500">
            No executions yet. Connect an app to get started.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <span className="text-sm font-medium text-gray-500">{title}</span>
      <div className={`mt-3 text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
