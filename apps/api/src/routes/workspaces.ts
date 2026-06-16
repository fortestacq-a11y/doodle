import type { FastifyInstance } from "fastify";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/", async () => ({ workspaces: [] }));
  app.post("/", async (request) => {
    const body = request.body as { name: string };
    return { id: "ws_new", name: body.name };
  });
}
