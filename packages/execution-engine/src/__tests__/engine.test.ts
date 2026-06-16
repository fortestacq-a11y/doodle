import { describe, it, expect } from "vitest";
import { executeTool, ToolNotFoundError } from "../index.js";

describe("Execution Engine", () => {
  it("tool not found throws ToolNotFoundError", async () => {
    await expect(executeTool("nonexistent_tool", {}, "ws-1")).rejects.toThrow(ToolNotFoundError);
  });

  it("connector not connected throws ConnectorNotConnectedError", async () => {
    await expect(executeTool("gmail_send_email", { to: "test@test.com", subject: "Hi", body: "Hello" }, "nonexistent-workspace")).rejects.toThrow();
  });

  it("ToolNotFoundError has correct code", async () => {
    try {
      await executeTool("fake_tool", {}, "ws-1");
    } catch (err) {
      expect(err).toBeInstanceOf(ToolNotFoundError);
      expect((err as ToolNotFoundError).code).toBe("TOOL_NOT_FOUND");
    }
  });
});
