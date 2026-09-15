import { describe, expect, it } from "vitest";
import { pbkdf2Sync } from "node:crypto";
import { hash } from "bcryptjs";
import { processPasswordRequest, verifyPassword } from "../../supabase/functions/password-crypto/crypto";

describe("password computation outside the Worker", () => {
  it("preserves existing PBKDF2 admin passwords and rejects wrong passwords", async () => {
    const salt = Buffer.from("fixed-test-salt-16-bytes");
    const digest = pbkdf2Sync("관리자-test", salt, 100_000, 32, "sha256");
    const encoded = `pbkdf2-sha256$100000$${salt.toString("base64")}$${digest.toString("base64")}`;
    expect(await verifyPassword("관리자-test", encoded)).toBe(true);
    expect(await verifyPassword("wrong", encoded)).toBe(false);
    expect(await verifyPassword("관리자-test", encoded.replace("100000", "1000001"))).toBe(false);
    expect(await verifyPassword("관리자-test", encoded + "$extra")).toBe(false);
  });

  it("preserves existing bcrypt passwords and hashes new submissions at cost 12", async () => {
    const legacy = await hash("existing-password", 12);
    expect(await verifyPassword("existing-password", legacy)).toBe(true);
    expect(await verifyPassword("wrong-password", legacy)).toBe(false);
    const result = await processPasswordRequest({ operation: "hash", password: "new-password" });
    expect(result.hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("new-password", result.hash!)).toBe(true);
  });

  it("rejects malformed requests and unbounded work", async () => {
    await expect(processPasswordRequest(null)).rejects.toThrow();
    await expect(processPasswordRequest({ operation: "hash", password: "x" })).rejects.toThrow();
    await expect(processPasswordRequest({ operation: "verify", password: "x".repeat(201), encoded: "x" })).rejects.toThrow();
    expect(await verifyPassword("password", "$2b$31$" + "a".repeat(53))).toBe(false);
    expect(await verifyPassword("password", "pbkdf2-sha256$100000$AA==$AA==")).toBe(false);
  });
});
