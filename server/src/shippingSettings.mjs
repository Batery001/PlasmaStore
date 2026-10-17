export const SHIPPING_SETTINGS_ID = "shipping";

/**
 * @param {any} db
 */
export async function readShippingSettings(db) {
  const row = await db.collection("store_settings").findOne({ _id: SHIPPING_SETTINGS_ID });
  const cfg = row && typeof row === "object" ? row : {};
  return {
    shipping_fee_cents: Number.isFinite(Number(cfg.shipping_fee_cents))
      ? Math.max(0, Math.floor(Number(cfg.shipping_fee_cents)))
      : parseInt(String(process.env.STORE_SHIPPING_FEE_CENTS || "0"), 10) || 0,
    shipping_note:
      cfg.shipping_note != null
        ? String(cfg.shipping_note).trim()
        : String(process.env.STORE_SHIPPING_NOTE || "").trim() ||
          "Los envíos se realizan por Starken los días jueves, por pagar (pago contra entrega).",
    pickup_address:
      cfg.pickup_address != null
        ? String(cfg.pickup_address).trim()
        : String(process.env.STORE_PICKUP_ADDRESS || "").trim() ||
          "Plasma Store — retiro en tienda (te confirmamos por correo/WhatsApp).",
    charge_shipping_online: cfg.charge_shipping_online === true || cfg.charge_shipping_online === 1,
    updatedAt: cfg.updatedAt || null,
  };
}

/**
 * @param {any} db
 * @param {Record<string, unknown>} body
 */
export async function saveShippingSettings(db, body) {
  const prev = await readShippingSettings(db);
  const shipping_fee_cents =
    body.shipping_fee_cents !== undefined
      ? Math.max(0, parseInt(String(body.shipping_fee_cents).replace(/[^\d]/g, "") || "0", 10) || 0)
      : prev.shipping_fee_cents;
  const shipping_note =
    body.shipping_note !== undefined ? String(body.shipping_note || "").trim() : prev.shipping_note;
  const pickup_address =
    body.pickup_address !== undefined ? String(body.pickup_address || "").trim() : prev.pickup_address;
  const charge_shipping_online =
    body.charge_shipping_online !== undefined
      ? body.charge_shipping_online === true ||
        body.charge_shipping_online === 1 ||
        body.charge_shipping_online === "1"
      : prev.charge_shipping_online;

  const now = new Date();
  const doc = {
    _id: SHIPPING_SETTINGS_ID,
    shipping_fee_cents,
    shipping_note,
    pickup_address,
    charge_shipping_online: Boolean(charge_shipping_online),
    updatedAt: now,
  };
  await db.collection("store_settings").replaceOne({ _id: SHIPPING_SETTINGS_ID }, doc, { upsert: true });
  return readShippingSettings(db);
}
