/**
 * Boleta de venta (mismo estilo que el POS Plasma Store).
 * Documento informativo / comprobante — no es DTE del SII.
 */
import { nextSeq } from "./counters.mjs";
import { readStoreOps } from "./storeOpsSettings.mjs";

const IVA_RATE = 0.19;

/**
 * @param {number} totalCents
 */
export function splitIvaFromGross(totalCents) {
  const total = Math.max(0, Math.round(totalCents) || 0);
  const net = Math.round(total / (1 + IVA_RATE));
  const iva = total - net;
  return { net_cents: net, iva_cents: iva, total_cents: total, iva_rate: IVA_RATE };
}

/**
 * @param {any} order
 */
export function paymentLabelFromOrder(order) {
  const provider = String(order?.payment?.provider || "").toLowerCase();
  const tender = String(order?.payment?.tender || "").trim();
  if (provider === "webpay" || provider === "webpay_mock") return "Webpay";
  if (provider === "tuu" || provider === "tuu_pago") return "TUU Pago Online";
  if (provider === "pos") return tender ? `Caja · ${tender}` : "Caja (POS)";
  if (order?.channel === "event") {
    const m = String(order?.payment_method || order?.fulfillment?.method || "").toLowerCase();
    if (m === "store" || m === "tienda") return "Pago en tienda";
    if (m === "webpay") return "Webpay";
  }
  const method = String(order?.fulfillment?.method || "").toLowerCase();
  if (method === "pickup") return "Retiro en tienda";
  if (method === "shipping") return "Envío";
  return provider || "Pago online";
}

/**
 * @param {any} db
 * @param {any} order
 */
export async function issueBoletaForOrder(db, order) {
  if (!order || order.boleta?.folio) {
    return order?.boleta || null;
  }
  const ops = await readStoreOps(db);
  const total = Math.max(0, parseInt(String(order.total_cents ?? 0), 10) || 0);
  const split = splitIvaFromGross(total);
  const folio = await nextSeq(db, "boleta");
  const now = new Date();
  const boleta = {
    folio,
    issued_at: now,
    currency: "CLP",
    style: "pos",
    ...split,
    buyer_rut: order.buyer_rut || order.fulfillment?.rut || null,
    buyer_name: order.buyer_name || order.fulfillment?.recipient || null,
    buyer_email: order.buyer_email || order.fulfillment?.email || null,
    company_name: ops.company_name || "Plasma Store",
    company_rut: ops.company_rut || null,
    company_address: ops.company_address || null,
    company_giro: ops.company_giro || null,
    payment_label: paymentLabelFromOrder(order),
    note: "Documento informativo — Conserve su comprobante",
  };
  await db.collection("store_orders").updateOne(
    { _id: order._id },
    { $set: { boleta, updatedAt: now } }
  );
  const fresh = await db.collection("store_orders").findOne({ _id: order._id }, { projection: { boleta: 1 } });
  return fresh?.boleta || boleta;
}

function fmtClp(n) {
  return `$${Number(n || 0).toLocaleString("es-CL")}`;
}

function formatIssuedAt(raw) {
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

/**
 * HTML imprimible estilo boleta del POS.
 * @param {any} order
 * @param {any} boleta
 * @param {{ logoUrl?: string, baseUrl?: string }} [opts]
 */
export function boletaHtml(order, boleta, opts = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const rows = items
    .map((it) => {
      const qty = Number(it.quantity) || 0;
      const unit = Math.max(0, parseInt(String(it.price_cents ?? 0), 10) || 0);
      const line =
        typeof it.line_total_cents === "number"
          ? it.line_total_cents
          : unit * qty;
      const qtxt = Number.isInteger(qty) ? String(qty) : String(qty);
      return (
        "<tr>" +
        `<td>${escapeHtml(it.name || "Ítem")}</td>` +
        `<td align="right">${escapeHtml(qtxt)}</td>` +
        `<td align="right">${escapeHtml(fmtClp(unit))}</td>` +
        `<td align="right">${escapeHtml(fmtClp(line))}</td>` +
        "</tr>"
      );
    })
    .join("");

  const logoUrl = opts.logoUrl || "/receipt_logo.png";
  const payLabel = boleta.payment_label || paymentLabelFromOrder(order);
  const total = boleta.total_cents ?? order.total_cents ?? 0;
  const shipping = Math.max(0, parseInt(String(order.shipping_fee_cents ?? 0), 10) || 0);
  const customer =
    boleta.buyer_name ||
    order.buyer_name ||
    order.fulfillment?.recipient ||
    null;
  const customerBits = [];
  if (customer) customerBits.push(escapeHtml(customer));
  if (boleta.buyer_rut) customerBits.push(`RUT ${escapeHtml(boleta.buyer_rut)}`);

  const delivery = order.fulfillment?.label
    ? `<p style="font-size:10pt;color:#333;margin-top:8px"><b>Entrega:</b> ${escapeHtml(order.fulfillment.label)}</p>`
    : "";

  const shippingBlock =
    shipping > 0
      ? `<p style="font-size:10pt;color:#333;margin-top:4px">Envío: <b>${escapeHtml(fmtClp(shipping))}</b></p>`
      : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><title>Boleta — Venta #${escapeHtml(String(order._id))}</title>
<style>
  @media print { .noprint { display: none !important; } body { background: #fff !important; } }
</style>
</head><body style="font-family:'Segoe UI',Arial,sans-serif;font-size:11pt;margin:12px;background:#f4f4f8;color:#1a1a1a;">
<button class="noprint" type="button" onclick="window.print()" style="margin-bottom:12px;padding:8px 14px;cursor:pointer">Imprimir…</button>
<div style="max-width:460px;margin:0 auto;padding:12px;border-radius:6px;background:#f4f4f8">
  <div style="text-align:center;margin-bottom:10px">
    <img src="${escapeHtml(logoUrl)}" width="200" alt="Plasma Store" onerror="this.style.display='none'"/>
  </div>
  <div style="text-align:center">
    <b>${escapeHtml(boleta.company_name || "PLASMA STORE")}</b><br/>
    Boleta de venta<br/>
    <span style="font-size:10pt;color:#444">Gracias por su compra</span>
  </div>
  <p style="text-align:center;margin:10px 0">
    <b>Venta #${escapeHtml(String(order._id))}</b>
    ${boleta.folio ? `<br/><span style="font-size:10pt;color:#444">Folio ${escapeHtml(String(boleta.folio))}</span>` : ""}
    <br/>
    ${escapeHtml(formatIssuedAt(boleta.issued_at || order.createdAt))}
  </p>
  ${
    customerBits.length
      ? `<p style="text-align:center;margin:6px 0;font-size:10pt"><b>Cliente:</b> ${customerBits.join(" · ")}</p>`
      : ""
  }
  <table width="100%" cellspacing="0" cellpadding="5" style="border-top:1px solid #222;border-bottom:1px solid #222;font-size:10pt">
    <tr style="font-weight:bold">
      <td>Producto</td><td align="right">Cant.</td>
      <td align="right">P. unit.</td><td align="right">Importe</td>
    </tr>
    ${rows || `<tr><td colspan="4">Sin ítems</td></tr>`}
  </table>
  <p>
    <b>Total:</b> ${escapeHtml(fmtClp(total))}<br/>
    <b>Pago (${escapeHtml(payLabel)}):</b> ${escapeHtml(fmtClp(total))}<br/>
    <b>Cambio:</b> $0
  </p>
  ${shippingBlock}
  ${delivery}
  <hr/>
  <div style="text-align:center;font-size:9pt;color:#555">
    ${escapeHtml(boleta.note || "Documento informativo — Conserve su comprobante")}
  </div>
</div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
