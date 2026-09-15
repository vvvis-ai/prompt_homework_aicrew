import "server-only";

async function requestPasswordService(body: { operation: "hash" | "verify"; password: string; encoded?: string }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Password service is not configured");
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/password-crypto`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Password service failed (${response.status})`);
  return await response.json() as { hash?: unknown; valid?: unknown };
}

export async function hashPassword(password: string): Promise<string> {
  const result = await requestPasswordService({ operation: "hash", password });
  if (typeof result.hash !== "string" || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(result.hash)) {
    throw new Error("Invalid password service response");
  }
  return result.hash;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const result = await requestPasswordService({ operation: "verify", password, encoded });
  if (typeof result.valid !== "boolean") throw new Error("Invalid password service response");
  return result.valid;
}
