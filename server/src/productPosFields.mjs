/**
 * Campos de producto alineados con el alta rápida del POS (pesos CLP enteros, como price_cents en la web).
 */

/**
 * @param {Record<string, unknown>} body
 * @param {{ partial?: boolean }} [opts]
 */
export function parseProductPosFields(body, opts = {}) {
  const partial = Boolean(opts.partial);
  /** @type {Record<string, unknown>} */
  const out = {};
  const has = (k) => body?.[k] !== undefined && body?.[k] !== null;

  if (!partial || has("barcode")) {
    const barcode = String(body?.barcode ?? "").trim().slice(0, 64);
    out.barcode = barcode || null;
  }
  if (!partial || has("category")) {
    out.category = String(body?.category ?? "").trim().slice(0, 80) || null;
  }
  if (!partial || has("subcategory")) {
    out.subcategory = String(body?.subcategory ?? "").trim().slice(0, 80) || null;
  }
  if (!partial || has("cost_cents")) {
    const raw = String(body?.cost_cents ?? "").trim().replace(/[^\d]/g, "");
    const n = raw === "" ? 0 : parseInt(raw, 10);
    out.cost_cents = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (!partial || has("vat_19_enabled") || has("vat19") || has("vat_19")) {
    const v = body?.vat_19_enabled ?? body?.vat19 ?? body?.vat_19;
    out.vat_19_enabled =
      v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "on";
  }
  if (!partial || has("margin_percent")) {
    const n = parseInt(String(body?.margin_percent ?? "0"), 10);
    out.margin_percent = Number.isFinite(n) ? Math.max(0, Math.min(95, n)) : 0;
  }
  if (!partial || has("min_stock") || has("min_stock_qty")) {
    const n = parseInt(String(body?.min_stock ?? body?.min_stock_qty ?? "0"), 10);
    out.min_stock = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (!partial || has("discount_percent")) {
    const n = parseInt(String(body?.discount_percent ?? "0"), 10);
    out.discount_percent = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  }
  if (!partial || has("promo_min_qty")) {
    const n = parseInt(String(body?.promo_min_qty ?? "0"), 10);
    out.promo_min_qty = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (!partial || has("promo_bundle_total_cents") || has("promo_total")) {
    const raw = String(body?.promo_bundle_total_cents ?? body?.promo_total ?? "")
      .trim()
      .replace(/[^\d]/g, "");
    const n = raw === "" ? 0 : parseInt(raw, 10);
    out.promo_bundle_total_cents = Number.isFinite(n) && n >= 0 ? n : 0;
  }

  return out;
}

/**
 * @param {any} p
 */
export function publicAdminProduct(p) {
  if (!p) return null;
  return {
    id: p._id,
    name: p.name,
    description: p.description || "",
    price_cents: p.price_cents || 0,
    compare_price_cents: typeof p.compare_price_cents === "number" ? p.compare_price_cents : null,
    image_url: p.image_url ?? null,
    image_urls: Array.isArray(p.image_urls) ? p.image_urls : p.image_url ? [p.image_url] : [],
    stock: p.stock || 0,
    active: p.active ? 1 : 0,
    tags: Array.isArray(p.tags) ? p.tags : [],
    sales_channel: p.sales_channel === "store_only" ? "store_only" : "both",
    barcode: p.barcode != null ? String(p.barcode) : null,
    category: p.category != null ? String(p.category) : null,
    subcategory: p.subcategory != null ? String(p.subcategory) : null,
    cost_cents: Number.isFinite(Number(p.cost_cents)) ? Number(p.cost_cents) : 0,
    vat_19_enabled: p.vat_19_enabled === true || p.vat_19_enabled === 1,
    margin_percent: Number.isFinite(Number(p.margin_percent)) ? Number(p.margin_percent) : 0,
    min_stock: Number.isFinite(Number(p.min_stock)) ? Number(p.min_stock) : 0,
    discount_percent: Number.isFinite(Number(p.discount_percent)) ? Number(p.discount_percent) : 0,
    promo_min_qty: Number.isFinite(Number(p.promo_min_qty)) ? Number(p.promo_min_qty) : 0,
    promo_bundle_total_cents: Number.isFinite(Number(p.promo_bundle_total_cents))
      ? Number(p.promo_bundle_total_cents)
      : 0,
  };
}
