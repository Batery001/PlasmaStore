/**
 * Configuración de pagos (Webpay + TUU) persistida en DB.
 * Prioridad: ajustes del admin → variables de entorno.
 */
import { normalizeTuuMode, TEST_ACCOUNT_ID } from "./tuuCheckout.mjs";

export const PAYMENTS_SETTINGS_ID = "payments";

function asBool(raw, fallback = true) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (raw === true || raw === 1 || raw === "1") return true;
  const v = String(raw).trim().toLowerCase();
  if (v === "true" || v === "si" || v === "sí" || v === "on" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return fallback;
}

/** @param {unknown} raw */
export function normalizePaymentMode(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "mock" || v === "test_mock" || v === "simulacion" || v === "simulación") return "mock";
  if (v === "production" || v === "prod" || v === "live" || v === "produccion" || v === "producción") return "production";
  return "integration";
}

/**
 * @param {any} db
 */
export async function readPaymentSettings(db) {
  const row = await db.collection("store_settings").findOne({ _id: PAYMENTS_SETTINGS_ID });
  const cfg = row && typeof row === "object" ? row : {};
  const mockEnv =
    String(process.env.WEBPAY_MOCK || "").trim() === "1" ||
    String(process.env.WEBPAY_MOCK || "").toLowerCase() === "true";
  const envFallback = mockEnv ? "mock" : process.env.WEBPAY_ENV || "integration";
  const envTuuEnabled =
    process.env.TUU_ENABLED == null || String(process.env.TUU_ENABLED).trim() === ""
      ? true
      : asBool(process.env.TUU_ENABLED, true);
  return {
    mode: normalizePaymentMode(cfg.mode != null && String(cfg.mode).trim() !== "" ? cfg.mode : envFallback),
    commerce_code: cfg.commerce_code != null ? String(cfg.commerce_code).trim() : String(process.env.WEBPAY_COMMERCE_CODE || "").trim(),
    api_key: cfg.api_key != null ? String(cfg.api_key).trim() : String(process.env.WEBPAY_API_KEY || "").trim(),
    public_base_url: cfg.public_base_url != null ? String(cfg.public_base_url).trim() : String(process.env.PUBLIC_BASE_URL || "").trim(),
    tuu_enabled: cfg.tuu_enabled != null ? asBool(cfg.tuu_enabled, true) : envTuuEnabled,
    tuu_mode: normalizeTuuMode(
      cfg.tuu_mode != null && String(cfg.tuu_mode).trim() !== "" ? cfg.tuu_mode : process.env.TUU_ENV || "integration"
    ),
    tuu_account_id:
      cfg.tuu_account_id != null
        ? String(cfg.tuu_account_id).trim()
        : String(process.env.TUU_ACCOUNT_ID || "").trim(),
    tuu_secret:
      cfg.tuu_secret != null ? String(cfg.tuu_secret).trim() : String(process.env.TUU_SECRET || "").trim(),
    updatedAt: cfg.updatedAt || null,
    source: row ? "db" : "env",
  };
}

/**
 * Vista segura para el admin (API key enmascarada).
 * @param {Awaited<ReturnType<typeof readPaymentSettings>>} cfg
 */
export function publicPaymentSettingsView(cfg) {
  const key = cfg.api_key || "";
  let api_key_masked = "";
  if (key.length <= 8) api_key_masked = key ? "••••••••" : "";
  else api_key_masked = `${key.slice(0, 4)}…${key.slice(-4)}`;
  const tuuKey = cfg.tuu_secret || "";
  let tuu_secret_masked = "";
  if (tuuKey.length <= 8) tuu_secret_masked = tuuKey ? "••••••••" : "";
  else tuu_secret_masked = `${tuuKey.slice(0, 4)}…${tuuKey.slice(-4)}`;
  return {
    mode: cfg.mode,
    commerce_code: cfg.commerce_code || "",
    api_key_masked,
    api_key_set: Boolean(key),
    public_base_url: cfg.public_base_url || "",
    tuu_enabled: cfg.tuu_enabled !== false,
    tuu_mode: cfg.tuu_mode || "integration",
    tuu_account_id: cfg.tuu_account_id || "",
    tuu_secret_masked,
    tuu_secret_set: Boolean(tuuKey),
    tuu_ready_for_live:
      cfg.tuu_enabled !== false &&
      cfg.tuu_mode === "production" &&
      Boolean(cfg.tuu_account_id) &&
      Boolean(tuuKey),
    updatedAt: cfg.updatedAt,
    source: cfg.source,
    ready_for_live: cfg.mode === "production" && Boolean(cfg.commerce_code) && Boolean(key),
    checklist: {
      mode_set: Boolean(cfg.mode),
      commerce_code: cfg.mode !== "production" || Boolean(cfg.commerce_code),
      api_key: cfg.mode !== "production" || Boolean(key),
      public_base_url: Boolean(cfg.public_base_url) || cfg.mode === "mock",
    },
  };
}

/**
 * @param {any} db
 * @param {Record<string, unknown>} body
 * @param {{ keepApiKeyIfEmpty?: boolean }} [opts]
 */
export async function savePaymentSettings(db, body, opts = {}) {
  const prev = await readPaymentSettings(db);
  const mode = body.mode !== undefined ? normalizePaymentMode(body.mode) : prev.mode;
  const commerce_code =
    body.commerce_code !== undefined ? String(body.commerce_code || "").trim() : prev.commerce_code;
  let api_key = prev.api_key;
  if (body.api_key !== undefined) {
    const incoming = String(body.api_key || "").trim();
    if (incoming) api_key = incoming;
    else if (opts.keepApiKeyIfEmpty === false) api_key = "";
  }
  const public_base_url =
    body.public_base_url !== undefined ? String(body.public_base_url || "").trim() : prev.public_base_url;
  const tuu_enabled = body.tuu_enabled !== undefined ? asBool(body.tuu_enabled, true) : prev.tuu_enabled !== false;
  const tuu_mode = body.tuu_mode !== undefined ? normalizeTuuMode(body.tuu_mode) : prev.tuu_mode;
  const tuu_account_id =
    body.tuu_account_id !== undefined ? String(body.tuu_account_id || "").trim() : prev.tuu_account_id;
  let tuu_secret = prev.tuu_secret;
  if (body.tuu_secret !== undefined) {
    const incoming = String(body.tuu_secret || "").trim().replace(/\s+/g, "");
    if (incoming) tuu_secret = incoming;
    else if (opts.keepApiKeyIfEmpty === false) tuu_secret = "";
  }

  if (tuu_mode === "production") {
    if (!tuu_account_id || !tuu_secret) {
      throw Object.assign(
        new Error("Producción TUU requiere account_id y secret reales. Pégalos antes de guardar."),
        { status: 400 }
      );
    }
    if (tuu_account_id === TEST_ACCOUNT_ID) {
      throw Object.assign(
        new Error("No uses el account_id de prueba (62224230) en producción. Pedí a TUU tus claves reales."),
        { status: 400 }
      );
    }
    if (public_base_url && !/^https:\/\//i.test(public_base_url)) {
      throw Object.assign(
        new Error("En producción la URL pública debe ser HTTPS (ej. https://plasmastoretcg.cl)."),
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const doc = {
    _id: PAYMENTS_SETTINGS_ID,
    mode,
    commerce_code,
    api_key,
    public_base_url,
    tuu_enabled,
    tuu_mode,
    tuu_account_id,
    tuu_secret,
    updatedAt: now,
  };
  await db.collection("store_settings").replaceOne({ _id: PAYMENTS_SETTINGS_ID }, doc, { upsert: true });
  return readPaymentSettings(db);
}
