import { describe, it, expect } from "vitest";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const API_KEY = "nexus_test_key_12345";

async function api(path: string, options?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

describe("API Auth Middleware", () => {
  it("public paths bypass auth", async () => {
    const res = await fetch(`${API_URL}/v1/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string };
    expect(data.status).toBeDefined();
  });

  it("missing auth header returns 401", async () => {
    const res = await fetch(`${API_URL}/v1/tools`);
    expect(res.status).toBe(401);
  });

  it("valid API key returns 200", async () => {
    const res = await api("/v1/tools");
    expect(res.status).toBe(200);
  });

  it("invalid token returns 401", async () => {
    const res = await fetch(`${API_URL}/v1/tools`, {
      headers: { Authorization: "Bearer invalid_token_12345" },
    });
    expect(res.status).toBe(401);
  });
});

describe("Tools API", () => {
  it("GET /v1/tools returns tool list", async () => {
    const res = await api("/v1/tools");
    expect(res.status).toBe(200);
    const tools = (await res.json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools[0]).toHaveProperty("name");
    expect(tools[0]).toHaveProperty("connector");
  });

  it("GET /v1/tools/:slug returns tool details", async () => {
    const res = await api("/v1/tools/gmail_send_email");
    expect(res.status).toBe(200);
    const tool = (await res.json()) as Record<string, unknown>;
    expect(tool.slug).toBe("gmail_send_email");
  });

  it("GET /v1/tools/:unknown returns 404", async () => {
    const res = await api("/v1/tools/nonexistent_tool_xyz");
    expect(res.status).toBe(404);
  });
});

describe("Connections API", () => {
  it("GET /v1/connections returns array", async () => {
    const res = await api("/v1/connections");
    expect(res.status).toBe(200);
    const connections = await res.json();
    expect(Array.isArray(connections)).toBe(true);
  });
});

describe("Executions API", () => {
  it("GET /v1/executions returns array", async () => {
    const res = await api("/v1/executions");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
