import { formatCLP } from "../lib/money";

export type ShipTicketOrder = {
  _id: number;
  status?: string;
  total_cents?: number;
  shipping_fee_cents?: number;
  createdAt?: string | Date;
  buyer_email?: string;
  items?: Array<{ name?: string; quantity?: number; price_cents?: number; line_total_cents?: number }>;
  fulfillment?: {
    method?: string;
    label?: string;
    recipient?: string | null;
    phone?: string | null;
    email?: string | null;
    rut?: string | null;
    notes?: string | null;
    shipping_note?: string | null;
    shipping_fee_cents?: number;
    address?: {
      street?: string;
      apartment?: string;
      commune?: string;
      region?: string;
    } | null;
  } | null;
};

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addrLine(o: ShipTicketOrder) {
  const a = o.fulfillment?.address;
  if (!a) return "—";
  return [a.street, a.apartment, a.commune, a.region].filter(Boolean).join(", ");
}

function whenLabel(d?: string | Date) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("es-CL");
  } catch {
    return String(d);
  }
}

/** Abre diálogo de impresión del PC (elegí la boletera térmica). */
export function printShippingTicket(order: ShipTicketOrder) {
  const f = order.fulfillment || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const rows = items
    .map((it) => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const name = esc(it.name || "Producto");
      return `<tr><td>${qty}×</td><td>${name}</td></tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Envío #${esc(order._id)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Consolas", "Courier New", monospace;
    font-size: 12px;
    line-height: 1.35;
    color: #000;
    width: 72mm;
  }
  h1 { font-size: 15px; margin: 0 0 6px; text-align: center; }
  .muted { color: #333; font-size: 11px; }
  .hr { border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  td:first-child { width: 2.2em; white-space: nowrap; }
  .label { font-weight: 700; }
  .big { font-size: 13px; font-weight: 700; }
  @media print {
    body { width: 72mm; }
  }
</style>
</head>
<body>
  <h1>PLASMA STORE</h1>
  <div style="text-align:center" class="muted">TICKET DE ENVÍO</div>
  <div class="hr"></div>
  <div class="big">Orden #${esc(order._id)}</div>
  <div class="muted">${esc(whenLabel(order.createdAt))}</div>
  <div class="hr"></div>
  <div><span class="label">Cliente:</span> ${esc(f.recipient || "—")}</div>
  <div><span class="label">Tel:</span> ${esc(f.phone || "—")}</div>
  <div><span class="label">RUT:</span> ${esc(f.rut || "—")}</div>
  <div><span class="label">Email:</span> ${esc(f.email || order.buyer_email || "—")}</div>
  <div class="hr"></div>
  <div class="label">Dirección</div>
  <div>${esc(addrLine(order))}</div>
  ${f.notes ? `<div class="hr"></div><div><span class="label">Notas:</span> ${esc(f.notes)}</div>` : ""}
  ${f.shipping_note ? `<div class="muted">${esc(f.shipping_note)}</div>` : ""}
  <div class="hr"></div>
  <div class="label">Productos</div>
  <table>${rows || "<tr><td colspan='2'>—</td></tr>"}</table>
  <div class="hr"></div>
  <div><span class="label">Envío:</span> ${esc(formatCLP(order.shipping_fee_cents || f.shipping_fee_cents || 0))}</div>
  <div class="big">Total ${esc(formatCLP(order.total_cents || 0))}</div>
  <div class="hr"></div>
  <div style="text-align:center" class="muted">Pegar en el paquete</div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); }, 180);
    };
  </script>
</body>
</html>`;

  const w = window.open("", "plasma-ship-ticket", "width=420,height=720");
  if (!w) {
    window.alert("Permite ventanas emergentes para imprimir el ticket.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
