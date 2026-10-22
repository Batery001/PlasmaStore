/**
 * Config SMTP / correo de la tienda (Gmail u otro).
 * Prioridad: ajustes admin → env.
 */

export const MAIL_SETTINGS_ID = "mail";

/**
 * @param {any} db
 */
export async function readMailSettings(db) {
  const row = await db.collection("store_settings").findOne({ _id: MAIL_SETTINGS_ID });
  const cfg = row && typeof row === "object" ? row : {};
  const enabled =
    cfg.enabled === true ||
    cfg.enabled === 1 ||
    String(process.env.SMTP_ENABLED || "").trim() === "1";

  return {
    enabled,
    host: cfg.host != null ? String(cfg.host).trim() : String(process.env.SMTP_HOST || "smtp.gmail.com").trim(),
    port: Number.isFinite(Number(cfg.port))
      ? Number(cfg.port)
      : parseInt(String(process.env.SMTP_PORT || "587"), 10) || 587,
    secure: cfg.secure === true || cfg.secure === 1 || String(process.env.SMTP_SECURE || "") === "1",
    user: cfg.user != null ? String(cfg.user).trim() : String(process.env.SMTP_USER || "").trim(),
    pass: (cfg.pass != null ? String(cfg.pass) : String(process.env.SMTP_PASS || ""))
      .replace(/\s+/g, "")
      .trim(),
    from_email:
      cfg.from_email != null
        ? String(cfg.from_email).trim()
        : String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim(),
    from_name: cfg.from_name != null ? String(cfg.from_name).trim() : String(process.env.SMTP_FROM_NAME || "Plasma Store").trim(),
    notify_orders_to:
      cfg.notify_orders_to != null
        ? String(cfg.notify_orders_to).trim()
        : String(process.env.SMTP_NOTIFY_ORDERS || "").trim(),
    updatedAt: cfg.updatedAt || null,
    source: row ? "db" : "env",
  };
}

/**
 * @param {Awaited<ReturnType<typeof readMailSettings>>} cfg
 */
export function publicMailSettingsView(cfg) {
  const pass = cfg.pass || "";
  let pass_masked = "";
  if (pass) pass_masked = pass.length <= 4 ? "••••" : `${"•".repeat(Math.min(8, pass.length - 2))}${pass.slice(-2)}`;
  return {
    enabled: Boolean(cfg.enabled),
    host: cfg.host || "smtp.gmail.com",
    port: cfg.port || 587,
    secure: Boolean(cfg.secure),
    user: cfg.user || "",
    pass_masked,
    pass_set: Boolean(pass),
    from_email: cfg.from_email || cfg.user || "",
    from_name: cfg.from_name || "Plasma Store",
    notify_orders_to: cfg.notify_orders_to || "",
    notify_orders_effective: resolveOrderNotifyTo(cfg),
    ready: Boolean(cfg.enabled && cfg.host && cfg.user && pass && (cfg.from_email || cfg.user)),
    updatedAt: cfg.updatedAt,
    source: cfg.source,
    hint_gmail:
      "Gmail: 1) activa verificación en 2 pasos, 2) crea una “Contraseña de aplicaciones” (no uses la clave normal), 3) pégala aquí. Si Google la muestra con espacios, da igual: el sistema los quita solo.",
  };
}

/**
 * Destino del aviso de nueva venta: campo dedicado → remitente → usuario SMTP.
 * @param {{ notify_orders_to?: string, from_email?: string, user?: string }} cfg
 */
export function resolveOrderNotifyTo(cfg) {
  const dedicated = String(cfg.notify_orders_to || "").trim();
  if (dedicated.includes("@")) return dedicated.toLowerCase();
  const from = String(cfg.from_email || "").trim();
  if (from.includes("@")) return from.toLowerCase();
  const user = String(cfg.user || "").trim();
  if (user.includes("@")) return user.toLowerCase();
  return "";
}

/**
 * @param {any} db
 * @param {Record<string, unknown>} body
 */
export async function saveMailSettings(db, body) {
  const prev = await readMailSettings(db);
  const enabled = body.enabled !== undefined ? body.enabled === true || body.enabled === 1 || body.enabled === "1" : prev.enabled;
  const host = body.host !== undefined ? String(body.host || "").trim() : prev.host;
  const port =
    body.port !== undefined ? parseInt(String(body.port), 10) || 587 : prev.port;
  const secure =
    body.secure !== undefined ? body.secure === true || body.secure === 1 || body.secure === "1" : prev.secure;
  const user = body.user !== undefined ? String(body.user || "").trim() : prev.user;
  let pass = prev.pass;
  if (body.pass !== undefined) {
    const incoming = String(body.pass || "").trim();
    // Gmail muestra la app password con espacios; SMTP no los acepta.
    if (incoming) pass = incoming.replace(/\s+/g, "");
  }
  const from_email = body.from_email !== undefined ? String(body.from_email || "").trim() : prev.from_email;
  const from_name = body.from_name !== undefined ? String(body.from_name || "").trim() : prev.from_name;
  const notify_orders_to =
    body.notify_orders_to !== undefined ? String(body.notify_orders_to || "").trim() : prev.notify_orders_to;

  const now = new Date();
  const doc = {
    _id: MAIL_SETTINGS_ID,
    enabled: Boolean(enabled),
    host,
    port,
    secure: Boolean(secure),
    user,
    pass,
    from_email,
    from_name,
    notify_orders_to,
    updatedAt: now,
  };
  await db.collection("store_settings").replaceOne({ _id: MAIL_SETTINGS_ID }, doc, { upsert: true });
  return readMailSettings(db);
}
