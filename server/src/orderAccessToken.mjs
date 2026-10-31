/**
 * Tokens firmados para acceso a boleta / estado de orden sin sesión.
 */
import crypto from "node:crypto";
import { APP_SESSION_SECRET } from "./config.mjs";

function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s) {
  const str = String(s || "");
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/**
 * @param {{ orderId: number, purpose?: string, ttlSec?: number }} opts
 */
export function makeOrderAccessToken(opts) {
  const orderId = parseInt(String(opts.orderId), 10);
  if (!Number.isFinite(orderId) || orderId < 1) throw new Error("orderId inválido");
  const purpose = String(opts.purpose || "boleta").trim() || "boleta";
  const ttlSec = Math.max(60, parseInt(String(opts.ttlSec ?? 60 * 60 * 24 * 30), 10) || 60 * 60 * 24 * 30);
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const raw = JSON.stringify({ oid: orderId, p: purpose, exp });
  const sig = crypto.createHmac("sha256", APP_SESSION_SECRET()).update(raw).digest();
  return `${b64urlEncode(raw)}.${b64urlEncode(sig)}`;
}

/**
 * @param {string} token
 * @param {string} [purpose]
 * @returns {{ orderId: number, purpose: string } | null}
 */
export function verifyOrderAccessToken(token, purpose = "boleta") {
  const rawTok = String(token || "").trim();
  const [p64, s64] = rawTok.split(".");
  if (!p64 || !s64) return null;
  let raw = "";
  try {
    raw = b64urlDecode(p64).toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", APP_SESSION_SECRET()).update(raw).digest();
  let got;
  try {
    got = b64urlDecode(s64);
  } catch {
    return null;
  }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j.oid !== "number") return null;
    if (Math.floor(Date.now() / 1000) > Number(j.exp || 0)) return null;
    if (String(j.p || "") !== String(purpose)) return null;
    return { orderId: j.oid, purpose: String(j.p) };
  } catch {
    return null;
  }
}
