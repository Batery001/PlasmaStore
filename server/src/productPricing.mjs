/**
 * Precio efectivo de venta (descuento % + promo por cantidad).
 * Montos en pesos CLP enteros (convención web).
 */

/**
 * @param {{ price_cents?: number, compare_price_cents?: number|null, discount_percent?: number, promo_min_qty?: number, promo_bundle_total_cents?: number }} product
 * @param {number} quantity
 */
export function effectiveLinePricing(product, quantity = 1) {
  const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
  const listPrice = Math.max(0, parseInt(String(product?.price_cents ?? 0), 10) || 0);
  const compare =
    typeof product?.compare_price_cents === "number" && product.compare_price_cents > listPrice
      ? product.compare_price_cents
      : null;

  // Precio unitario base: si hay descuento % sobre lista (o compare)
  let unit = listPrice;
  const discount = Math.max(0, Math.min(100, parseInt(String(product?.discount_percent ?? 0), 10) || 0));
  const baseForDiscount = compare != null ? compare : listPrice;
  if (discount > 0 && discount < 100) {
    unit = Math.round((baseForDiscount * (100 - discount)) / 100);
  }

  const promoMin = Math.max(0, parseInt(String(product?.promo_min_qty ?? 0), 10) || 0);
  const promoTotal = Math.max(0, parseInt(String(product?.promo_bundle_total_cents ?? 0), 10) || 0);

  let lineTotal = unit * qty;
  let unitEffective = unit;
  let promoApplied = false;

  if (promoMin > 1 && promoTotal > 0 && qty >= promoMin) {
    const bundles = Math.floor(qty / promoMin);
    const rem = qty % promoMin;
    lineTotal = bundles * promoTotal + rem * unit;
    unitEffective = Math.round(lineTotal / qty);
    promoApplied = true;
  }

  return {
    list_price_cents: compare != null ? compare : listPrice,
    unit_price_cents: unitEffective,
    line_total_cents: lineTotal,
    quantity: qty,
    discount_percent: discount,
    promo_applied: promoApplied,
    compare_price_cents: compare,
  };
}

/**
 * Precio unitario a mostrar en catálogo (qty=1).
 * @param {any} product
 */
export function catalogUnitPrice(product) {
  return effectiveLinePricing(product, 1).unit_price_cents;
}
