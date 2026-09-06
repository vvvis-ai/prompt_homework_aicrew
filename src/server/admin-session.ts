import "server-only";

import { timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import type { AdminSessionView } from "@/lib/types";
import { isDemoMode } from "@/server/supabase";

export const ADMIN_COOKIE = "aicrew_admin_session";

type AdminToken = {
  authenticated: true;
  operatorId?: string;
  operatorName?: string;
};

function sessionSecret() {
  const value =
    process.env.ADMIN_SESSION_SECRET ??
    (isDemoMode() ? "demo-only-session-secret-change-before-production" : "");
  if (value.length < 32) throw new Error("ADMIN_SESSION_SECRET은 32자 이상이어야 합니다.");
  return new TextEncoder().encode(value);
}

async function verifyPbkdf2Password(password: string, encoded: string) {
  const [algorithm, iterationsText, saltText, digestText] = encoded.split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== "pbkdf2-sha256" ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000
  ) {
    return false;
  }

  const salt = Buffer.from(saltText ?? "", "base64");
  const expected = Buffer.from(digestText ?? "", "base64");
  if (salt.length < 16 || expected.length !== 32) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const actual = Buffer.from(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      expected.length * 8,
    ),
  );
  return timingSafeEqual(actual, expected);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD_PBKDF2) {
    return verifyPbkdf2Password(password, process.env.ADMIN_PASSWORD_PBKDF2);
  }
  if (process.env.ADMIN_PASSWORD_HASH) {
    return compare(password, process.env.ADMIN_PASSWORD_HASH);
  }
  const expected =
    process.env.ADMIN_PASSWORD ??
    (isDemoMode() && process.env.NODE_ENV !== "production" ? "010723" : "");
  if (!expected) return false;
  const actualBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function createAdminToken(operator?: { id: string; name: string }) {
  const payload: AdminToken = {
    authenticated: true,
    operatorId: operator?.id,
    operatorName: operator?.name,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .setIssuer("aicrew")
    .setAudience("aicrew-admin")
    .sign(sessionSecret());
}

export async function getAdminSession(): Promise<AdminSessionView> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return { authenticated: false, operatorId: null, operatorName: null };
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      issuer: "aicrew",
      audience: "aicrew-admin",
    });
    return {
      authenticated: payload.authenticated === true,
      operatorId: typeof payload.operatorId === "string" ? payload.operatorId : null,
      operatorName: typeof payload.operatorName === "string" ? payload.operatorName : null,
    };
  } catch {
    return { authenticated: false, operatorId: null, operatorName: null };
  }
}

export async function requireOperator() {
  const session = await getAdminSession();
  if (!session.authenticated || !session.operatorId || !session.operatorName) {
    throw new Error("UNAUTHORIZED");
  }
  return { operatorId: session.operatorId, operatorName: session.operatorName };
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8,
};
