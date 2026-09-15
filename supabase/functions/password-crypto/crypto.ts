import { Buffer } from "node:buffer";
import { compare, hash } from "bcryptjs";

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  // Bound the work even for an authenticated caller. Keep existing bcrypt hashes valid.
  if (/^\$2[aby]\$(0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/.test(encoded)) {
    return compare(password, encoded);
  }
  const [algorithm, iterationsText, saltText, digestText, extra] = encoded.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2-sha256" || extra !== undefined || !Number.isInteger(iterations)
    || iterations < 100_000 || iterations > 1_000_000) return false;
  const salt = Buffer.from(saltText ?? "", "base64");
  const expected = Buffer.from(digestText ?? "", "base64");
  if (salt.length < 16 || salt.length > 64 || expected.length !== 32) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256,
  ));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export async function processPasswordRequest(body: unknown) {
  if (!body || typeof body !== "object") throw new TypeError("Invalid request");
  const input = body as Record<string, unknown>;
  if (typeof input.password !== "string" || input.password.length < 1 || input.password.length > 200) {
    throw new TypeError("Invalid password");
  }
  if (input.operation === "hash" && input.password.length >= 4 && input.password.length <= 72) {
    return { hash: await hash(input.password, 12) };
  }
  if (input.operation === "verify" && typeof input.encoded === "string" && input.encoded.length <= 256) {
    return { valid: await verifyPassword(input.password, input.encoded) };
  }
  throw new TypeError("Invalid operation");
}
