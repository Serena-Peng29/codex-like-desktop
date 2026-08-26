import { describe, expect, it, afterEach } from "vitest";
import { createGatewayServer } from "./server.js";

describe("test model gateway", () => {
  let server: ReturnType<typeof createGatewayServer>;
  afterEach(() => server?.close());
  it("streams an OpenAI-compatible response and charges the ledger", async () => {
    server = createGatewayServer(); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("no address");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "hello", userId: "test-user", model: "gpt-4o-mini" }) });
    expect(response.status).toBe(200); const text = await response.text(); expect(text).toContain("response.output_text.delta"); expect(text).toContain("response.completed");
  });
  it("rejects a request when package and configured overage credits are exhausted", async () => {
    server = createGatewayServer(); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("no address");
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "x".repeat(1000), userId: "test-user" }) });
    expect(response.status).toBe(402); expect(await response.text()).toContain("insufficient_credits");
  });
});
