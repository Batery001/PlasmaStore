/**
 * Ajustes operativos de la tienda (compliance / checkout).
 */
export const STORE_OPS_ID = "store_ops";

const DEFAULTS = {
  require_email_verified: true,
  min_age: 18,
  smtp_required_on_register: false,
  company_name: "Plasma Store",
  company_rut: "",
  company_address: "",
  company_giro: "Comercio al por menor de juegos y juguetes",
};

/**
 * @param {any} db
 */
export async function readStoreOps(db) {
  const row = await db.collection("store_settings").findOne({ _id: STORE_OPS_ID });
  const raw = row && typeof row === "object" ? row : {};
  const minAgeRaw = parseInt(String(raw.min_age ?? DEFAULTS.min_age), 10);
  return {
    require_email_verified:
      raw.require_email_verified === undefined
        ? DEFAULTS.require_email_verified
        : raw.require_email_verified === true || raw.require_email_verified === 1 || raw.require_email_verified === "1",
    min_age: Number.isFinite(minAgeRaw) && minAgeRaw >= 0 ? Math.min(99, minAgeRaw) : DEFAULTS.min_age,
    smtp_required_on_register:
      raw.smtp_required_on_register === undefined
        ? DEFAULTS.smtp_required_on_register
        : raw.smtp_required_on_register === true ||
          raw.smtp_required_on_register === 1 ||
          raw.smtp_required_on_register === "1",
    company_name: String(raw.company_name || DEFAULTS.company_name).trim().slice(0, 120) || DEFAULTS.company_name,
    company_rut: String(raw.company_rut || "").trim().slice(0, 20),
    company_address: String(raw.company_address || "").trim().slice(0, 240),
    company_giro: String(raw.company_giro || DEFAULTS.company_giro).trim().slice(0, 160) || DEFAULTS.company_giro,
    updatedAt: raw.updatedAt || null,
  };
}

/**
 * @param {any} db
 * @param {Record<string, unknown>} body
 */
export async function saveStoreOps(db, body) {
  const prev = await readStoreOps(db);
  const next = { ...prev };
  if (body.require_email_verified !== undefined) {
    next.require_email_verified =
      body.require_email_verified === true ||
      body.require_email_verified === 1 ||
      body.require_email_verified === "1";
  }
  if (body.smtp_required_on_register !== undefined) {
    next.smtp_required_on_register =
      body.smtp_required_on_register === true ||
      body.smtp_required_on_register === 1 ||
      body.smtp_required_on_register === "1";
  }
  if (body.min_age !== undefined) {
    const n = parseInt(String(body.min_age), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 99) next.min_age = n;
  }
  if (body.company_name !== undefined) {
    next.company_name = String(body.company_name || "").trim().slice(0, 120) || DEFAULTS.company_name;
  }
  if (body.company_rut !== undefined) next.company_rut = String(body.company_rut || "").trim().slice(0, 20);
  if (body.company_address !== undefined) next.company_address = String(body.company_address || "").trim().slice(0, 240);
  if (body.company_giro !== undefined) {
    next.company_giro = String(body.company_giro || "").trim().slice(0, 160) || DEFAULTS.company_giro;
  }
  const now = new Date();
  const doc = { _id: STORE_OPS_ID, ...next, updatedAt: now };
  await db.collection("store_settings").replaceOne({ _id: STORE_OPS_ID }, doc, { upsert: true });
  return readStoreOps(db);
}

/**
 * @param {number} birthYear
 * @param {number} birthMonth
 * @param {number} birthDay
 * @param {number} minAge
 */
export function ageFromBirth(birthYear, birthMonth, birthDay, minAge) {
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  const m = today.getMonth() + 1 - birthMonth;
  if (m < 0 || (m === 0 && today.getDate() < birthDay)) age -= 1;
  return { age, ok: age >= minAge };
}
