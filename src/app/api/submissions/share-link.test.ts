import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/password-service", () => ({ hashPassword: vi.fn(), verifyPassword: vi.fn() }));
vi.mock("@/server/supabase", () => ({ isDemoMode: () => true, getSupabaseAdmin: () => { throw new Error("Validation must happen before database access"); } }));
import { POST } from "./route";
import { PATCH } from "./[id]/route";
import { SHARED_LINK_REQUIRED_MESSAGE } from "@/lib/url";

const request = (method: string, url: string) => new Request("http://localhost/api/submissions", {
  method, headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ participantId: "1", password: "test-password", url }),
});

describe("server-side share link enforcement", () => {
  it.each(["https://chatgpt.com/c/private", "https://chatgpt.com/c/private?x=/share/example", "https://share.gemini.google/example"])("blocks direct create and edit API calls: %s", async (url) => {
    for (const response of [await POST(request("POST", url)), await PATCH(request("PATCH", url), { params: Promise.resolve({ id: "1" }) })]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: SHARED_LINK_REQUIRED_MESSAGE });
    }
  });

  it("allows share links through the validation in create and edit", async () => {
    const url = "https://chatgpt.com/share/example";
    expect((await POST(request("POST", url))).status).toBe(200);
    expect((await PATCH(request("PATCH", url), { params: Promise.resolve({ id: "1" }) })).status).toBe(200);
  });
});
