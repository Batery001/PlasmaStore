import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import crypto from "node:crypto";
import { APP_SESSION_SECRET } from "./config.mjs";

function b64url(input) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(data) {
  return b64url(crypto.createHmac("sha256", APP_SESSION_SECRET()).update(data).digest());
}

const cookieSecure = () => process.env.NODE_ENV === "production";

export function readCookies(req) {
  const h = String(req.headers.cookie || "");
  return parseCookie(h || "");
}

/** @typedef {{ uid: string; admin: boolean; exp: number }} SessionPayload */

/**
 * @param {import('express').Request} req
 * @returns {SessionPayload | null}
 */
export function readSession(req) {
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
    const j = JSON.parse(raw);
    if (!j?.uid || typeof j.uid !== "string") return null;
    if (typeof j.exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) > j.exp) return null;
    return { uid: j.uid, admin: Boolean(j.admin), exp: j.exp };
  } catch {
    return null;
  }
}

/**
 * @param {Omit<SessionPayload, "exp">} payload
 * @param {number} maxAgeSeconds
 */
export function makeSessionCookie(payload, maxAgeSeconds) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const p = { ...payload, exp };
  const raw = JSON.stringify(p);
  const val = `${b64url(raw)}.${sign(raw)}`;
  return serializeCookie("ps_session", val, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie() {
  return serializeCookie("ps_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
  });
}
