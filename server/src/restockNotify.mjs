import { findRestockSubscribers, isRestockTransition, markWishlistNotified } from "./wishlist.mjs";
import { sendMail } from "./mailer.mjs";
import { readPaymentSettings } from "./paymentSettings.mjs";

/**
 * Si el producto pasa de 0 → >0, avisa por mail a quien pidió «Avisame».
 * @param {any} db
 * @param {{ _id?: number, id?: number, name?: string }} product
 * @param {number} prevStock
 * @param {number} nextStock
 */
export async function maybeNotifyWishlistRestock(db, product, prevStock, nextStock) {
  if (!isRestockTransition(prevStock, nextStock)) {
    return { ok: true, sent: 0, skipped: true };
  }
  const productId = Number(product?._id ?? product?.id);
  if (!Number.isFinite(productId) || productId < 1) {
    return { ok: false, sent: 0, error: "productId inválido" };
  }
  const name = String(product?.name || `Producto #${productId}`).trim();
  const subs = await findRestockSubscribers(db, productId);
  if (!subs.length) return { ok: true, sent: 0 };

  let productUrl = `/producto/${productId}`;
  try {
    const pay = await readPaymentSettings(db);
    const base = String(pay?.public_base_url || process.env.PUBLIC_BASE_URL || "")
      .trim()
      .replace(/\/$/, "");
    if (base) productUrl = `${base}/producto/${productId}`;
  } catch {
    /* relative ok */
  }

  let sent = 0;
  const notifiedIds = [];
  for (const sub of subs) {
    const r = await sendMail(db, {
      to: sub.email,
      subject: `¡Volvió el stock! · ${name}`,
      text: `Hola, el producto "${name}" ya tiene stock en Plasma Store. Míralo aquí: ${productUrl}`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
        <h2 style="margin:0 0 0.75rem">¡Volvió el stock!</h2>
        <p>El producto <strong>${escapeHtml(name)}</strong> ya está disponible en Plasma Store.</p>
        <p><a href="${escapeHtml(productUrl)}" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Ver producto</a></p>
        <p style="color:#64748b;font-size:0.9rem">Te avisamos porque pediste notificación cuando hubiera stock.</p>
      </div>`,
    });
    if (r?.ok) {
      sent += 1;
      if (sub.user_id) notifiedIds.push(sub.user_id);
    }
  }
  if (notifiedIds.length) {
    await markWishlistNotified(db, productId, notifiedIds);
  } else if (sent > 0) {
    await markWishlistNotified(db, productId);
  }
  return { ok: true, sent, total: subs.length };
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
