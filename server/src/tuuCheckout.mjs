/**
 * TUU Pago Online (Haulmer) — payment intent.
 * Docs: https://developers.tuu.cl/docs/payment-intent
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const TUU_SETTINGS_FIELDS = ["tuu_enabled", "tuu_mode", "tuu_account_id", "tuu_secret"];

const TEST_ACCOUNT_ID = "62224230";
const TEST_SECRET =
  "yAk0dXTJLQzkeEWODsQWVpPX0bn7ND50qwoQrXgqqNiUyEpgxIPxPtoCgKeLNeh1upTw72JZx5O9x5IaAtPIGUAVcMNcsUSg3M0M8tgWdUb4F8qkS8I7rHpOUmZqzvfS";

export const TUU_ENDPOINTS = {
  integration: "https://frontend-api.payment.haulmer.dev/v1/payment",
  production: "https://core.payment.haulmer.com/api/v1/payment",
};

export function normalizeTuuMode(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "production" || v === "prod" || v === "live" || v === "produccion" || v === "producción") {
    return "production";
  }
  return "integration";
}

export function tuuEndpoint(mode) {
  return normalizeTuuMode(mode) === "production" ? TUU_ENDPOINTS.production : TUU_ENDPOINTS.integration;
}

/** @param {Record<string, unknown>} params */
export function signTuuParams(params, secret) {
  const keys = Object.keys(params)
    .filter((k) => k.startsWith("x_") && k !== "x_signature")
    .sort();
  let cadena = "";
  for (const k of keys) {
    const v = params[k];
    cadena += k + (v == null ? "" : String(v));
  }
  return createHmac("sha256", String(secret || ""))
    .update(cadena, "utf8")
    .digest("hex");
}

export function signaturesMatch(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return false;
  const ba = Buffer.from(left, "utf8");
  const bb = Buffer.from(right, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function collectTuuParams(source) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!source || typeof source !== "object") return out;
  for (const [k, v] of Object.entries(source)) {
    if (!String(k).startsWith("x_")) continue;
    if (Array.isArray(v)) out[k] = String(v[0] ?? "");
    else if (v == null) out[k] = "";
    else out[k] = String(v);
  }
  return out;
}

export function tuuResultApproved(result) {
  const v = String(result || "")
    .trim()
    .toLowerCase();
  return v === "completed" || v === "complete" || v === "ok" || v === "approved" || v === "authorized" || v === "success";
}

export function tuuResultFailed(result) {
  const v = String(result || "")
    .trim()
    .toLowerCase();
  return v === "failed" || v === "fail" || v === "rejected" || v === "cancelled" || v === "canceled" || v === "error";
}

export function splitCustomerName(full) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts.shift() || "Cliente";
  const last = parts.join(" ") || "Plasma Store";
  return { first, last };
}

export function normalizePhoneCl(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("56") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("9") && digits.length === 9) return `+56${digits}`;
  if (digits.length >= 8) return `+56${digits}`;
  return "";
}

/**
 * @param {{
 *   accountId: string,
 *   amount: number,
 *   email: string,
 *   firstName: string,
 *   lastName: string,
 *   phone: string,
 *   description: string,
 *   reference: string,
 *   shopName: string,
 *   callbackUrl: string,
 *   cancelUrl: string,
 *   completeUrl: string,
 * }} input
 */
export function buildTuuPayload(input) {
  return {
    x_account_id: String(input.accountId),
    x_amount: String(Math.round(Number(input.amount) || 0)),
    x_currency: "CLP",
    x_customer_email: String(input.email || ""),
    x_customer_first_name: String(input.firstName || "Cliente"),
    x_customer_last_name: String(input.lastName || "Plasma Store"),
    x_customer_phone: String(input.phone || ""),
    x_description: String(input.description || "").slice(0, 180),
    x_reference: String(input.reference),
    x_shop_name: String(input.shopName || "Plasma Store"),
    x_shop_country: "CL",
    x_url_callback: String(input.callbackUrl),
    x_url_cancel: String(input.cancelUrl),
    x_url_complete: String(input.completeUrl),
  };
}

/**
 * @param {Awaited<ReturnType<import("./paymentSettings.mjs").readPaymentSettings>>} cfg
 */
export function resolveTuuCredentials(cfg) {
  const enabled = cfg.tuu_enabled !== false;
  const mode = normalizeTuuMode(cfg.tuu_mode);
  const customId = String(cfg.tuu_account_id || "").trim();
  const customSecret = String(cfg.tuu_secret || "").trim();
  const usingTest = mode !== "production" && (!customId || !customSecret);
  const accountId = usingTest ? TEST_ACCOUNT_ID : customId;
  const secret = usingTest ? TEST_SECRET : customSecret;
  return {
    enabled,
    mode,
    accountId,
    secret,
    usingTest,
    endpoint: tuuEndpoint(mode),
    ready_for_live: mode === "production" && Boolean(customId) && Boolean(customSecret),
  };
}

/**
 * Intenta crear el intento por API JSON. Si TUU responde una URL, el cliente navega ahí.
 * Si no, el checkout hace POST del formulario firmado (estilo Jumpseller).
 * @param {string} endpoint
 * @param {Record<string, string>} fields
 */
export async function requestTuuPaymentUrl(endpoint, fields) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const body = { ...fields, x_amount: Number(fields.x_amount) };
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "X-REDIRECT": "false",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const url =
      (json &&
        (json.url ||
          json.redirect_url ||
          json.payment_url ||
          json.checkout_url ||
          json.data?.url ||
          json.payment?.url)) ||
      "";
    if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim();
    const loc = r.headers.get("location") || r.headers.get("Location") || "";
    if (/^https?:\/\//i.test(loc)) return loc;
    return null;
  } catch (e) {
    console.warn("[tuu] payment intent", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(t);
  }
}
