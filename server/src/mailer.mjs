import nodemailer from "nodemailer";
import { readMailSettings } from "./mailSettings.mjs";

/**
 * @param {any} db
 */
export async function createTransport(db) {
  const cfg = await readMailSettings(db);
  if (!cfg.enabled) {
    return { ok: false, error: "El envío de correo está desactivado. Configúralo en Admin → Correo." };
  }
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { ok: false, error: "Faltan datos SMTP (host, usuario o contraseña)." };
  }
  // Gmail: 587 = STARTTLS (secure:false); 465 = SSL directo (secure:true).
  const port = Number(cfg.port) || 587;
  let secure = Boolean(cfg.secure);
  if (port === 587) secure = false;
  if (port === 465) secure = true;

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port,
    secure,
    requireTLS: port === 587,
    // En Windows/redes sin IPv6 útil, Gmail a veces resuelve a IPv6 y falla ENETUNREACH.
    family: 4,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: { minVersion: "TLSv1.2", servername: cfg.host },
  });
  return { ok: true, transporter, cfg: { ...cfg, port, secure } };
}

/**
 * @param {any} db
 * @param {{ to: string, subject: string, text?: string, html?: string }} msg
 */
export async function sendMail(db, msg) {
  const built = await createTransport(db);
  if (!built.ok) return built;
  const fromEmail = built.cfg.from_email || built.cfg.user;
  const fromName = built.cfg.from_name || "Plasma Store";
  try {
    const info = await built.transporter.sendMail({
      from: `"${fromName.replace(/"/g, "")}" <${fromEmail}>`,
      to: msg.to,
      subject: msg.subject,
      text: msg.text || "",
      html: msg.html || undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[mail] send failed", detail);
    const port = built.cfg?.port ?? 587;
    let friendly = detail;
    if (/ENETUNREACH|EHOSTUNREACH/i.test(detail) && /:[0-9a-f]*:/i.test(detail)) {
      friendly =
        "No hay ruta IPv6 hacia Gmail. Se forzó IPv4; recarga y prueba de nuevo. Si persiste, revisa firewall/VPN.";
    } else if (/BadCredentials|Username and Password not accepted/i.test(detail)) {
      friendly =
        "Gmail rechazó usuario/contraseña. Usa una Contraseña de aplicaciones (con 2 pasos activo), no la clave normal.";
    } else if (/ETIMEDOUT|ECONNREFUSED|ESOCKET/i.test(detail)) {
      friendly = `No se pudo conectar al SMTP (${port}). Revisa host/puerto o firewall. Detalle: ${detail}`;
    }
    return { ok: false, error: `No se pudo enviar el correo: ${friendly}` };
  }
}

/**
 * @param {any} db
 */
export async function sendTestMail(db, to) {
  return sendMail(db, {
    to,
    subject: "Plasma Store · prueba de correo",
    text: "Si recibes este mensaje, el SMTP de Plasma Store está bien configurado.",
    html: "<p>Si recibes este mensaje, el SMTP de <strong>Plasma Store</strong> está bien configurado.</p>",
  });
}

export function receiptEmailHtml({ orderId, totalLabel, items, buyerName, deliveryHtml, boletaUrl, folio }) {
  const rows = (items || [])
    .map(
      (it) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(it.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${it.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(String(it.price_label || ""))}</td></tr>`
    )
    .join("");
  const boletaLink = boletaUrl
    ? `<p style="margin-top:1rem"><a href="${escapeHtml(boletaUrl)}" style="display:inline-block;padding:10px 16px;background:#5b21b6;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Ver / imprimir boleta de venta</a></p>`
    : "";
  const folioLine = folio ? ` · Folio ${escapeHtml(String(folio))}` : "";
  return `
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:560px;margin:0 auto;color:#222;background:#f4f4f8;padding:16px;border-radius:8px">
    <div style="text-align:center;margin-bottom:8px">
      <b style="font-size:1.15rem">PLASMA STORE</b><br/>
      <span>Boleta de venta</span><br/>
      <span style="font-size:0.9rem;color:#555">Gracias por su compra</span>
    </div>
    <p>Hola${buyerName ? ` ${escapeHtml(buyerName)}` : ""}, recibimos tu pago.</p>
    <p><strong>Venta #${escapeHtml(String(orderId))}</strong>${folioLine} · Total ${escapeHtml(totalLabel)}</p>
    ${deliveryHtml || ""}
    <table style="width:100%;border-collapse:collapse;margin-top:1rem;border-top:1px solid #222;border-bottom:1px solid #222">
      <thead><tr><th align="left">Producto</th><th align="right">Cant.</th><th align="right">Importe</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${boletaLink}
    <p style="margin-top:1.25rem;color:#666;font-size:0.85rem;text-align:center">Documento informativo — Conserve su comprobante</p>
  </div>`;
}

/**
 * Aviso interno al admin cuando llega una venta web pagada.
 */
export function adminOrderNotifyHtml({ orderId, totalLabel, items, buyerName, buyerEmail, deliveryHtml }) {
  const rows = (items || [])
    .map(
      (it) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(it.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${it.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(String(it.price_label || ""))}</td></tr>`
    )
    .join("");
  return `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#222">
    <h1 style="font-size:1.25rem">Nueva compra en la tienda</h1>
    <p>Se confirmó un pago por la página web.</p>
    <p><strong>Orden #${escapeHtml(String(orderId))}</strong> · Total ${escapeHtml(totalLabel)}</p>
    <p><strong>Cliente:</strong> ${escapeHtml(buyerName || "—")}<br/>
    <strong>Email:</strong> ${escapeHtml(buyerEmail || "—")}</p>
    ${deliveryHtml || ""}
    <table style="width:100%;border-collapse:collapse;margin-top:1rem">
      <thead><tr><th align="left">Producto</th><th align="left">Cant.</th><th align="left">Precio</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:1.25rem;color:#666;font-size:0.9rem">Revisa el detalle en Admin → Pedidos.</p>
  </div>`;
}

/**
 * Bloque HTML de entrega (retiro o despacho a domicilio con dirección completa).
 * @param {any} order
 */
export function orderDeliveryHtml(order) {
  const f = order?.fulfillment || {};
  const method = String(f.method || "").toLowerCase();
  const lines = [];

  if (method === "pickup" || method === "retiro") {
    lines.push(["Tipo", f.label || "Retiro en tienda"]);
    if (f.pickup_address) lines.push(["Dirección retiro", f.pickup_address]);
  } else if (method === "shipping" || method === "envio" || method === "envío") {
    lines.push(["Tipo", f.label || "Despacho a domicilio"]);
    const addr = f.address && typeof f.address === "object" ? f.address : null;
    if (addr) {
      const streetLine = [addr.street, addr.apartment].filter(Boolean).join(", ");
      if (streetLine) lines.push(["Dirección", streetLine]);
      if (addr.commune) lines.push(["Comuna", addr.commune]);
      if (addr.region) lines.push(["Región", addr.region]);
    } else if (typeof f.address === "string" && f.address.trim()) {
      lines.push(["Dirección", f.address.trim()]);
    }
    if (f.shipping_note) lines.push(["Nota envío", f.shipping_note]);
    if (f.shipping_payment === "por_pagar") lines.push(["Flete", "Por pagar (destinatario)"]);
  } else if (f.label) {
    lines.push(["Tipo", f.label]);
  }

  if (f.recipient) lines.push(["Quién recibe", f.recipient]);
  if (f.phone) lines.push(["Teléfono", f.phone]);
  if (f.notes) lines.push(["Notas", f.notes]);

  if (!lines.length) return "";

  const body = lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 8px 4px 0;color:#666;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0;color:#222">${escapeHtml(String(v))}</td></tr>`
    )
    .join("");

  return `
  <div style="margin:1rem 0;padding:0.85rem 1rem;background:#f7f7f8;border-radius:8px;border:1px solid #eee">
    <div style="font-weight:700;margin-bottom:0.45rem">Datos de entrega</div>
    <table style="border-collapse:collapse;font-size:0.95rem">${body}</table>
  </div>`;
}

/**
 * Texto plano de entrega para el cuerpo text/plain del mail.
 * @param {any} order
 */
export function orderDeliveryText(order) {
  const f = order?.fulfillment || {};
  const method = String(f.method || "").toLowerCase();
  const parts = [];
  if (method === "pickup" || method === "retiro") {
    parts.push(f.label || "Retiro en tienda");
    if (f.pickup_address) parts.push(f.pickup_address);
  } else if (method === "shipping" || method === "envio" || method === "envío") {
    parts.push(f.label || "Despacho a domicilio");
    const addr = f.address && typeof f.address === "object" ? f.address : null;
    if (addr) {
      parts.push([addr.street, addr.apartment, addr.commune, addr.region].filter(Boolean).join(", "));
    }
    if (f.shipping_note) parts.push(f.shipping_note);
  }
  if (f.recipient) parts.push(`Recibe: ${f.recipient}`);
  if (f.phone) parts.push(`Tel: ${f.phone}`);
  if (f.notes) parts.push(`Notas: ${f.notes}`);
  return parts.filter(Boolean).join(" · ") || "—";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatClpMail(cents) {
  const n = Number(cents) || 0;
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${n}`;
  }
}
