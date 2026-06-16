const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, options);
  return res.json();
}

export async function getTools() {
  return apiFetch("/v1/tools");
}

export async function getConnections() {
  return apiFetch("/v1/connections");
}

export async function getExecutions() {
  return apiFetch("/v1/executions");
}

export async function executeTool(tool: string, args: Record<string, unknown>) {
  return apiFetch("/v1/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, arguments: args }),
  });
}
