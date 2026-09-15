import { withSupabase } from "@supabase/server";
import { processPasswordRequest } from "./crypto.ts";

// Platform JWT checking cannot accept sb_secret keys. The wrapper validates the
// server's apikey before any password work; anonymous/user callers are rejected.
const app = {
  fetch: withSupabase({ auth: "secret" }, async (request: Request) => {
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "POST") return new Response(null, { status: 405, headers });
    const text = await request.text();
    if (text.length > 4096) return new Response(null, { status: 413, headers });
    try {
      return Response.json(await processPasswordRequest(JSON.parse(text)), { headers });
    } catch (error) {
      // Never log the request body, password, or stored password hash.
      const invalid = error instanceof TypeError || error instanceof SyntaxError;
      return Response.json({ error: invalid ? "Invalid request" : "Password service unavailable" }, {
        status: invalid ? 400 : 503, headers,
      });
    }
  }),
};

export default app;
