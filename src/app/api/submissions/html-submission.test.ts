import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], active: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/password-service", () => ({ hashPassword: async () => "private-hash", verifyPassword: async (password: string) => password === "correct" }));
vi.mock("@/server/supabase", () => ({ isDemoMode: () => false, getSupabaseAdmin: () => ({
  from(table: string) {
    let rows = table === "participants" ? [{ id: 1, challenge_id: 1, is_active: state.active, joined_at: "2026-10-01", left_at: null, name: "작성자" }] : table === "challenges" ? [{ id: 1, start_date: "2026-10-01", end_date: "2026-12-31", is_active: true }] : state.rows;
    let fields: string[] | undefined;
    const result = () => ({ data: rows[0] ? Object.fromEntries(Object.entries(rows[0]).filter(([key]) => !fields || fields.includes(key))) : null, error: null });
    const query = {
      select: (value: string) => { fields = value.split(","); return query; },
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
      maybeSingle: async () => result(), single: async () => result(),
      insert: (row: Record<string, unknown>) => { const stored = { ...row, id: 123, submitted_at: new Date().toISOString(), is_featured: false }; state.rows.push(stored); rows = [stored]; return query; },
      update: (changes: Record<string, unknown>) => { for (const row of rows) Object.assign(row, changes); return query; },
      delete: () => { const selected = rows; return { eq: (key: string, value: unknown) => { state.rows = state.rows.filter(row => !selected.includes(row) || row[key] !== value); return Promise.resolve({ error: null }); } }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  },
}) }));

import { POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";
import { GET } from "./[id]/html/route";
import { MAX_HTML_BYTES } from "@/lib/html-submission";
const context = { params: Promise.resolve({ id: "123" }) };
const html = "<!doctype html><html lang=ko><body><h1>나의 웹페이지</h1><script>document.body.dataset.ready='yes'</script></body></html>";
function upload({ name = "숙제.html", content = html, password = "correct", method = "POST", participantId = "1" } = {}) {
  const body = new FormData();
  body.set("participantId", participantId); body.set("password", password); body.set("title", "웹페이지 숙제");
  body.set("file", new File([content], name, { type: "text/html" }));
  return new Request("http://localhost/api/submissions", { method, body });
}
function json(method: string, body: Record<string, unknown>) { return new Request("http://localhost/api/submissions/123", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: "1", password: "correct", ...body }) }); }

beforeEach(() => { state.rows = []; state.active = true; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("HTML submission lifecycle", () => {
  it("stores UTF-8 HTML atomically, counts as homework and returns a detail URL without source/password", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ onTime: true, submission: { id: "123", url: "/submissions/123" } });
    expect(state.rows[0]).toMatchObject({ html_file_name: "숙제.html", html_content: html, participant_id: 1 });
    expect(JSON.stringify(result)).not.toContain("private-hash"); expect(JSON.stringify(result)).not.toContain("<html");
  });
  it.each([
    { name: "fake.png" }, { content: "" }, { content: "this is plain text" }, { content: "<html>\0binary</html>" }, { name: "a".repeat(180) + ".html" },
  ])("rejects invalid uploads before saving: %j", async (options) => {
    expect((await POST(upload(options))).status).toBe(400); expect(state.rows).toHaveLength(0);
  });
  it("bounds the file and the request stream even without Content-Length", async () => {
    expect((await POST(upload({ content: "<html>" + "a".repeat(MAX_HTML_BYTES) }))).status).toBe(413);
    const oversized = upload({ content: "<html>" + "a".repeat(MAX_HTML_BYTES + 65536) });
    // A real inbound request does not use undici's asynchronous FormData producer.
    const inbound = new Request(oversized.url, { method: "POST", headers: oversized.headers, body: await oversized.arrayBuffer() });
    expect((await POST(inbound)).status).toBe(413);
    expect(state.rows).toHaveLength(0);
  });
  it("rejects multiple files and non-UTF-8 content", async () => {
    const body = await upload().formData(); body.append("file", new File([html], "two.html"));
    expect((await POST(new Request("http://localhost", { method: "POST", body }))).status).toBe(400);
    body.delete("file"); body.set("file", new File([new Uint8Array([0xff, 0xfe, 0])], "bad.html"));
    expect((await POST(new Request("http://localhost", { method: "POST", body }))).status).toBe(400);
  });
  it("retains the participant eligibility and deadline checks", async () => {
    state.active = false; expect((await POST(upload())).status).toBe(403);
    state.active = true; vi.setSystemTime(new Date("2026-10-22T14:01:00Z"));
    const response = await POST(upload()); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ onTime: false });
    expect((await PATCH(upload({ method: "PATCH" }), context)).status).toBe(403);
  });
  it("requires password and ownership for replacement, preserving submitted_at", async () => {
    await POST(upload()); const submittedAt = state.rows[0].submitted_at;
    expect((await PATCH(upload({ method: "PATCH", password: "wrong" }), context)).status).toBe(403);
    expect((await PATCH(upload({ method: "PATCH", participantId: "2" }), context)).status).toBe(404);
    expect((await PATCH(upload({ method: "PATCH", name: "updated.html", content: "<h1>Updated</h1>" }), context)).status).toBe(200);
    expect(state.rows[0]).toMatchObject({ html_file_name: "updated.html", html_content: "<h1>Updated</h1>", submitted_at: submittedAt });
    expect((await PATCH(json("PATCH", { title: "New title" }), context)).status).toBe(200);
    expect(state.rows[0].html_content).toBe("<h1>Updated</h1>");
    expect((await PATCH(json("PATCH", { url: "https://example.com/share/a" }), context)).status).toBe(400);
  });
  it("serves an isolated document and attachment, and no longer serves deleted files", async () => {
    await POST(upload());
    const response = await GET(new Request("http://localhost/api/submissions/123/html"), context);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox allow-scripts;");
    expect(response.headers.get("Content-Security-Policy")).not.toContain("allow-same-origin");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'none'");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(html);
    const download = await GET(new Request("http://localhost/api/submissions/123/html?download=1"), context);
    expect(download.headers.get("Content-Disposition")).toContain("attachment;");
    expect(await download.text()).toBe(html);
    expect((await DELETE(json("DELETE", { password: "wrong" }), context)).status).toBe(403);
    expect((await DELETE(json("DELETE", {}), context)).status).toBe(200);
    expect((await GET(new Request("http://localhost"), context)).status).toBe(404);
  });
});
