/**
 * Cupones de descuento (porcentaje o monto fijo CLP).
 */
export const COUPONS_COLL = "store_coupons";

/**
 * @param {string} raw
 */
export function normalizeCouponCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * @param {any} db
 * @param {string} code
 * @param {number} subtotalCents
 */
export async function validateCoupon(db, code, subtotalCents) {
  const c = normalizeCouponCode(code);
  if (!c) return { ok: false, error: "Ingresa un código." };
  const row = await db.collection(COUPONS_COLL).findOne({ code: c, active: { $ne: false } });
  if (!row) return { ok: false, error: "Cupón no válido." };
  const now = Date.now();
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return { ok: false, error: "Cupón aún no vigente." };
  if (row.ends_at && new Date(row.ends_at).getTime() < now) return { ok: false, error: "Cupón expirado." };
  const maxUses = parseInt(String(row.max_uses ?? 0), 10) || 0;
  const used = parseInt(String(row.used_count ?? 0), 10) || 0;
  if (maxUses > 0 && used >= maxUses) return { ok: false, error: "Cupón agotado." };
  const minSub = parseInt(String(row.min_subtotal_cents ?? 0), 10) || 0;
  const sub = Math.max(0, Math.round(Number(subtotalCents) || 0));
  if (minSub > 0 && sub < minSub) {
    return { ok: false, error: `Monto mínimo del cupón: $${Math.round(minSub).toLocaleString("es-CL")}.` };
  }
  let discount = 0;
  if (row.type === "percent") {
    const pct = Math.min(100, Math.max(0, Number(row.value) || 0));
    discount = Math.round((sub * pct) / 100);
  } else {
    discount = Math.min(sub, Math.max(0, Math.round(Number(row.value) || 0)));
  }
  if (discount < 1) return { ok: false, error: "El cupón no aplica a este carrito." };
  return {
    ok: true,
    code: c,
    discount_cents: discount,
    type: row.type === "percent" ? "percent" : "fixed",
    value: row.value,
    label: row.label || c,
  };
}

/**
 * @param {any} db
 * @param {string} code
 */
export async function incrementCouponUse(db, code) {
  const c = normalizeCouponCode(code);
  if (!c) return;
  await db.collection(COUPONS_COLL).updateOne({ code: c }, { $inc: { used_count: 1 }, $set: { updatedAt: new Date() } });
}
