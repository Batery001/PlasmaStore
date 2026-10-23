/**
 * TUU Pago Online (Haulmer) — payment intent.
 * Docs: https://developers.tuu.cl/docs/payment-intent
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const TUU_SETTINGS_FIELDS = ["tuu_enabled", "tuu_mode", "tuu_account_id", "tuu_secret"];

/** Credenciales públicas de integración (solo haulmer.dev). */
export const TEST_ACCOUNT_ID = "62224230";
export const TEST_SECRET =
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
 * @param {string} url
 */
export function isHttpsUrl(url) {
  return /^https:\/\//i.test(String(url || "").trim());
}

/**
 * @param {Awaited<ReturnType<import("./paymentSettings.mjs").readPaymentSettings>>} cfg
 */
export function resolveTuuCredentials(cfg) {
  const enabled = cfg.tuu_enabled !== false;
  const mode = normalizeTuuMode(cfg.tuu_mode);
  const customId = String(cfg.tuu_account_id || "").trim();
  const customSecret = String(cfg.tuu_secret || "").trim().replace(/\s+/g, "");

  if (mode === "production") {
    let error = null;
    if (!customId || !customSecret) {
      error = "Faltan account_id y clave secreta de TUU producción (Admin → Sistema de pago).";
    } else if (customId === TEST_ACCOUNT_ID || customSecret === TEST_SECRET) {
      error = "En producción no se pueden usar las claves de prueba de Haulmer. Pedí a TUU el account_id y secret reales.";
    }
    return {
      enabled,
      mode,
      accountId: customId,
      secret: customSecret,
      usingTest: false,
      endpoint: TUU_ENDPOINTS.production,
      ready_for_live: !error,
      error,
    };
  }

  const usingTest = !customId || !customSecret;
  const accountId = usingTest ? TEST_ACCOUNT_ID : customId;
  const secret = usingTest ? TEST_SECRET : customSecret;
  return {
    enabled,
    mode,
    accountId,
    secret,
    usingTest,
    endpoint: TUU_ENDPOINTS.integration,
    ready_for_live: false,
    error: null,
  };
}

/**
 * Extrae URL de pago desde respuesta TUU (JSON o Location).
 * @param {unknown} json
 * @param {Headers} headers
 */
function extractTuuPaymentUrl(json, headers) {
  const fromJson =
    json &&
    typeof json === "object" &&
    (/** @type {any} */ (json).url ||
      /** @type {any} */ (json).redirect_url ||
      /** @type {any} */ (json).payment_url ||
      /** @type {any} */ (json).checkout_url ||
      /** @type {any} */ (json).data?.url ||
      /** @type {any} */ (json).payment?.url ||
      /** @type {any} */ (json).paymentIntent?.url ||
      /** @type {any} */ (json).payment_intent?.url);
  if (typeof fromJson === "string" && /^https?:\/\//i.test(fromJson.trim())) return fromJson.trim();
  const loc = headers.get("location") || headers.get("Location") || "";
  if (/^https?:\/\//i.test(loc)) return loc.trim();
  return null;
}

/**
 * Crea el payment intent por API JSON (recomendado).
 * Si TUU responde una URL, el cliente navega ahí; si no, se usa POST del formulario firmado.
 * @param {string} endpoint
 * @param {Record<string, string>} fields
 * @returns {Promise<{ url: string | null, ok: boolean, status: number, error: string | null, detail: string | null }>}
 */
export async function requestTuuPaymentUrl(endpoint, fields) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const amountNum = Math.round(Number(fields.x_amount) || 0);
    const body = { ...fields, x_amount: amountNum };
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "X-REDIRECT": "false",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "manual",
    });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const url = extractTuuPaymentUrl(json, r.headers);
    if (url) {
      return { url, ok: true, status: r.status, error: null, detail: null };
    }

    const msg =
      (json && typeof json === "object" && (/** @type {any} */ (json).message || /** @type {any} */ (json).error || /** @type {any} */ (json).detail)) ||
      null;
    const detail = String(msg || text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    const looksAuth =
      r.status === 401 ||
      r.status === 403 ||
      /secret|account|credencial|llave|firma|signature|invalid/i.test(detail);

    let error = null;
    if (r.status >= 400 || looksAuth) {
      error = looksAuth
        ? "TUU rechazó las credenciales (account_id / secret). Revisa Admin → Sistema de pago."
        : `TUU no pudo crear el pago (HTTP ${r.status}).`;
    }

    if (detail) {
      console.warn("[tuu] payment intent sin URL", { status: r.status, detail: detail.slice(0, 160) });
    }
    return { url: null, ok: false, status: r.status, error, detail: detail || null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[tuu] payment intent", msg);
    return {
      url: null,
      ok: false,
      status: 0,
      error: msg.includes("abort") ? "TUU no respondió a tiempo. Intenta de nuevo." : "No se pudo contactar a TUU.",
      detail: msg,
    };
  } finally {
    clearTimeout(t);
  }
}
