import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hashPassword, verifyPassword } from "./password-service";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function setup(response: Response) {
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co/");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("password service client", () => {
  it("authenticates server-to-server and respects a negative verification", async () => {
    const fetch = setup(Response.json({ valid: false }));
    expect(await verifyPassword("wrong", "encoded")).toBe(false);
    expect(fetch).toHaveBeenCalledWith("https://test.supabase.co/functions/v1/password-crypto", expect.objectContaining({
      method: "POST", headers: { "Content-Type": "application/json", apikey: "test-server-key" },
      body: JSON.stringify({ operation: "verify", password: "wrong", encoded: "encoded" }),
    }));
  });

  it("fails closed on HTTP failures, invalid JSON, and unexpected verification values", async () => {
    for (const response of [new Response("unavailable", { status: 503 }), new Response("<html>error</html>"), Response.json({ valid: "true" }), Response.json({})]) {
      setup(response);
      await expect(verifyPassword("password", "encoded")).rejects.toThrow();
    }
  });

  it("rejects malformed or weakened hash responses", async () => {
    setup(Response.json({ hash: "$2b$04$" + "a".repeat(53) }));
    await expect(hashPassword("password")).rejects.toThrow();
    const encoded = "$2b$12$" + "a".repeat(53);
    setup(Response.json({ hash: encoded }));
    expect(await hashPassword("password")).toBe(encoded);
  });
});
