import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { db } from "./db.server";

const COOKIE = "zaka_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sessionSecret(): string {
  const secret = process.env["ZAKA_SESSION_SECRET"] ?? process.env["JWT_SECRET"];
  if (!secret) throw new Error("ZAKA_SESSION_SECRET ou JWT_SECRET manquant");
  return secret;
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- Mots de passe (PBKDF2-SHA256, Web Crypto) ---------- */

const ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, digest] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !digest) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromB64url(salt) as BufferSource,
      iterations: Number(iterations),
      hash: "SHA-256",
    },
    key,
    256,
  );
  return timingSafeEqual(b64url(bits), digest);
}

/* ---------- Sessions ---------- */

export type SessionUser = { id: string; email: string; isAdmin: boolean };

export async function createSession(userId: string): Promise<void> {
  const sql = db();
  const expires = new Date(Date.now() + MAX_AGE * 1000).toISOString();
  const rows = (await sql`
    INSERT INTO sessions (user_id, expires_at) VALUES (${userId}, ${expires}) RETURNING id
  `) as { id: string }[];
  const id = rows[0]!.id;
  const token = `${id}.${await sign(id)}`;
  setResponseHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE}`,
  );
}

function readCookie(): string | null {
  const header = getRequestHeader("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = readCookie();
  if (!token) return null;
  const [id, signature] = token.split(".");
  if (!id || !signature) return null;
  if (!timingSafeEqual(await sign(id), signature)) return null;

  const sql = db();
  const rows = (await sql`
    SELECT u.id, u.email, u.is_admin
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${id} AND s.expires_at > now()
    LIMIT 1
  `) as { id: string; email: string; is_admin: boolean }[];
  const row = rows[0];
  return row ? { id: row.id, email: row.email, isAdmin: row.is_admin } : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Non authentifié");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("Accès réservé à l'administrateur de la plateforme");
  return user;
}

export async function destroySession(): Promise<void> {
  const token = readCookie();
  const id = token?.split(".")[0];
  if (id) {
    const sql = db();
    await sql`DELETE FROM sessions WHERE id = ${id}`;
  }
  setResponseHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
}
