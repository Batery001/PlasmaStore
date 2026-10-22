/** Precio efectivo (descuento % + promo por cantidad). Misma fórmula que productPricing.mjs del server. */

export type PricingProduct = {
  price_cents?: number;
  compare_price_cents?: number | null;
  discount_percent?: number;
  promo_min_qty?: number;
  promo_bundle_total_cents?: number;
};

export function effectiveLinePricing(product: PricingProduct, quantity = 1) {
  const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
  const listPrice = Math.max(0, parseInt(String(product?.price_cents ?? 0), 10) || 0);
  const compare =
    typeof product?.compare_price_cents === "number" && product.compare_price_cents > listPrice
      ? product.compare_price_cents
      : null;

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

export function lineTotal(product: PricingProduct, qty: number) {
  return effectiveLinePricing(product, qty).line_total_cents;
}
