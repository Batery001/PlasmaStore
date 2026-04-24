import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import crypto from "node:crypto";
import { APP_SESSION_SECRET } from "./env.js";

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export function json(res: any, status: number, body: Json, headers?: Record<string, string>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function readCookies(req: any): Record<string, string> {
  const h = String(req.headers?.cookie || "");
  return parseCookie(h || "");
}

type SessionPayload = { uid: string; admin: boolean; exp: number };

function b64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(data: string) {
  return b64url(crypto.createHmac("sha256", APP_SESSION_SECRET()).update(data).digest());
}

export function makeSessionCookie(payload: Omit<SessionPayload, "exp">, maxAgeSeconds: number) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const p: SessionPayload = { ...payload, exp };
  const raw = JSON.stringify(p);
  const val = `${b64url(raw)}.${sign(raw)}`;
  return serializeCookie("ps_session", val, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie() {
  return serializeCookie("ps_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
}

export function readSession(req: any): SessionPayload | null {
  const c = readCookies(req);
  const v = c.ps_session;
  if (!v) return null;
  const [p64, sig] = v.split(".");
  if (!p64 || !sig) return null;
  let raw = "";
  try {
    raw = Buffer.from(p64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
  if (sign(raw) !== sig) return null;
  try {
    const j = JSON.parse(raw) as SessionPayload;
    if (!j?.uid || typeof j.uid !== "string") return null;
    if (typeof j.exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) > j.exp) return null;
    return { uid: j.uid, admin: Boolean(j.admin), exp: j.exp };
  } catch {
    return null;
  }
}

export async function readJson(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const ch of req) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

