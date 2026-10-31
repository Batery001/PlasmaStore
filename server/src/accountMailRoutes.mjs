import bcrypt from "bcryptjs";
import {
  publicMailSettingsView,
  readMailSettings,
  resolveOrderNotifyTo,
  saveMailSettings,
} from "./mailSettings.mjs";
import { adminOrderNotifyHtml, formatClpMail, orderDeliveryHtml, orderDeliveryText, receiptEmailHtml, sendMail, sendTestMail } from "./mailer.mjs";
import { consumeAuthToken, createAuthToken } from "./authTokens.mjs";
import { passwordValidationError } from "./passwordRules.mjs";
import { clientKey, rateLimit } from "./rateLimit.mjs";

/**
 * Rutas de correo + verificación + reset password.
 * @param {import('express').Express} app
 * @param {{ getDb: () => Promise<any>, requireAdmin: (req: any) => Promise<any>, requireUser: (req: any) => Promise<any>, handleErr: (res: any, e: any) => void, resolvePublicBaseUrl: (req: any, db?: any) => Promise<string> }} deps
 */
export function mountAccountMailRoutes(app, { getDb, requireAdmin, requireUser, handleErr, resolvePublicBaseUrl }) {
  app.get("/api/store/admin/mail", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const cfg = await readMailSettings(db);
      res.json({ ok: true, mail: publicMailSettingsView(cfg) });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.patch("/api/store/admin/mail", async (req, res) => {
    try {
      await requireAdmin(req);
      const db = await getDb();
      const cfg = await saveMailSettings(db, req.body || {});
      res.json({
        ok: true,
        mail: publicMailSettingsView(cfg),
        message: cfg.enabled ? "Correo guardado y habilitado." : "Correo guardado (envío desactivado).",
      });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/admin/mail/test", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const db = await getDb();
      const to = String(req.body?.to || admin.email || "").trim().toLowerCase();
      if (!to.includes("@")) return res.status(400).json({ ok: false, error: "Indica un email de destino." });
      const r = await sendTestMail(db, to);
      if (!r.ok) {
        const raw = String(r.error || "");
        const friendly = /BadCredentials|Username and Password not accepted/i.test(raw)
          ? "Gmail rechazó usuario/contraseña. Usa una Contraseña de aplicaciones (con 2 pasos activo), no la clave normal de Gmail. Guarda de nuevo y prueba."
          : raw;
        return res.status(400).json({ ok: false, error: friendly });
      }
      res.json({ ok: true, message: `Correo de prueba enviado a ${to}.` });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/auth/request-verify", async (req, res) => {
    try {
      const rl = rateLimit(clientKey(req, "verify"), { limit: 5, windowMs: 15 * 60 * 1000 });
      if (!rl.ok) return res.status(429).json({ ok: false, error: `Demasiados intentos. Espera ${rl.retryAfterSec}s.` });
      const u = await requireUser(req);
      const db = await getDb();
      const row = await db.collection("store_users").findOne({ _id: u.id });
      if (!row) return res.status(404).json({ ok: false, error: "Usuario no encontrado." });
      if (row.email_verified) return res.json({ ok: true, message: "Tu correo ya está verificado." });
      const { token } = await createAuthToken(db, {
        type: "verify_email",
        user_id: u.id,
        email: row.email,
        ttlMs: 24 * 60 * 60 * 1000,
      });
      const base = await resolvePublicBaseUrl(req, db);
      const link = `${base}/verificar-email?token=${encodeURIComponent(token)}`;
      const sent = await sendMail(db, {
        to: row.email,
        subject: "Verifica tu correo · Plasma Store",
        text: `Verifica tu cuenta: ${link}`,
        html: `<p>Hola ${row.name || ""},</p><p><a href="${link}">Verifica tu correo</a> para activar tu cuenta en Plasma Store.</p><p>El enlace vale 24 horas.</p>`,
      });
      if (!sent.ok) return res.status(400).json({ ok: false, error: sent.error });
      res.json({ ok: true, message: "Te enviamos un correo de verificación." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/auth/verify-email", async (req, res) => {
    try {
      const db = await getDb();
      const token = String(req.body?.token || "").trim();
      const consumed = await consumeAuthToken(db, token, "verify_email");
      if (!consumed.ok) return res.status(400).json({ ok: false, error: consumed.error });
      await db.collection("store_users").updateOne(
        { _id: consumed.user_id },
        { $set: { email_verified: true, email_verified_at: new Date(), updatedAt: new Date() } }
      );
      res.json({ ok: true, message: "Correo verificado. Ya puedes comprar con tu cuenta." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/auth/forgot-password", async (req, res) => {
    try {
      const rl = rateLimit(clientKey(req, "forgot"), { limit: 5, windowMs: 15 * 60 * 1000 });
      if (!rl.ok) return res.status(429).json({ ok: false, error: `Demasiados intentos. Espera ${rl.retryAfterSec}s.` });
      const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();
      // respuesta genérica para no filtrar emails
      const generic = { ok: true, message: "Si el correo existe, te enviamos instrucciones." };
      if (!email.includes("@")) return res.json(generic);
      const db = await getDb();
      const row = await db.collection("store_users").findOne({ email });
      if (!row) return res.json(generic);
      const { token } = await createAuthToken(db, {
        type: "reset_password",
        user_id: row._id,
        email,
        ttlMs: 60 * 60 * 1000,
      });
      const base = await resolvePublicBaseUrl(req, db);
      const link = `${base}/recuperar?token=${encodeURIComponent(token)}`;
      await sendMail(db, {
        to: email,
        subject: "Recuperar contraseña · Plasma Store",
        text: `Restablece tu contraseña: ${link}`,
        html: `<p>Recibimos un pedido para restablecer tu contraseña.</p><p><a href="${link}">Crear nueva contraseña</a></p><p>El enlace vale 1 hora. Si no fuiste tú, ignora este correo.</p>`,
      });
      res.json(generic);
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/auth/reset-password", async (req, res) => {
    try {
      const rl = rateLimit(clientKey(req, "reset"), { limit: 10, windowMs: 15 * 60 * 1000 });
      if (!rl.ok) return res.status(429).json({ ok: false, error: `Demasiados intentos. Espera ${rl.retryAfterSec}s.` });
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");
      {
        const weak = passwordValidationError(password);
        if (weak) return res.status(400).json({ ok: false, error: weak });
      }
      const db = await getDb();
      const consumed = await consumeAuthToken(db, token, "reset_password");
      if (!consumed.ok) return res.status(400).json({ ok: false, error: consumed.error });
      const pass_hash = await bcrypt.hash(password, 10);
      await db.collection("store_users").updateOne(
        { _id: consumed.user_id },
        { $set: { pass_hash, updatedAt: new Date() } }
      );
      res.json({ ok: true, message: "Contraseña actualizada. Ya puedes iniciar sesión." });
    } catch (e) {
      handleErr(res, e);
    }
  });

  app.post("/api/store/auth/change-password", async (req, res) => {
    try {
      const u = await requireUser(req);
      const db = await getDb();
      const current = String(req.body?.current_password || req.body?.currentPassword || "");
      const next = String(req.body?.new_password || req.body?.newPassword || "");
      {
        const weak = passwordValidationError(next);
        if (weak) return res.status(400).json({ ok: false, error: weak });
      }
      const row = await db.collection("store_users").findOne({ _id: u.id });
      if (!row?.pass_hash) return res.status(400).json({ ok: false, error: "Cuenta sin contraseña." });
      const ok = await bcrypt.compare(current, row.pass_hash);
      if (!ok) return res.status(401).json({ ok: false, error: "Contraseña actual incorrecta." });
      const pass_hash = await bcrypt.hash(next, 10);
      await db.collection("store_users").updateOne({ _id: u.id }, { $set: { pass_hash, updatedAt: new Date() } });
      res.json({ ok: true, message: "Contraseña cambiada." });
    } catch (e) {
      handleErr(res, e);
    }
  });
}

function orderMailItems(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    price_label: formatClpMail(it.price_cents),
  }));
}

/**
 * Envía comprobante de pago (no falla la venta si el mail falla).
 * @param {any} db
 * @param {any} order
 */
export async function sendOrderReceipt(db, order) {
  const to = String(order?.buyer_email || order?.fulfillment?.email || "").trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, skipped: true, error: "Sin email de comprador." };
  const totalLabel = formatClpMail(order.total_cents);
  const deliveryText = orderDeliveryText(order);
  let boleta = order?.boleta || null;
  try {
    if (!boleta?.folio) {
      const { issueBoletaForOrder } = await import("./boleta.mjs");
      boleta = await issueBoletaForOrder(db, order);
    }
  } catch {
    /* ignore */
  }
  let base = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  try {
    const { readPaymentSettings } = await import("./paymentSettings.mjs");
    const pay = await readPaymentSettings(db);
    if (pay?.public_base_url) base = String(pay.public_base_url).replace(/\/+$/, "");
  } catch {
    /* env fallback */
  }
  const { makeOrderAccessToken } = await import("./orderAccessToken.mjs");
  const tok = makeOrderAccessToken({ orderId: order._id, purpose: "boleta" });
  const path = `/api/store/orders/${order._id}/boleta?t=${encodeURIComponent(tok)}`;
  const boletaUrl = base ? `${base}${path}` : path;
  const html = receiptEmailHtml({
    orderId: order._id,
    totalLabel,
    buyerName: order.fulfillment?.recipient || order.buyer_name || "",
    items: orderMailItems(order),
    deliveryHtml: orderDeliveryHtml(order),
    boletaUrl,
    folio: boleta?.folio || null,
  });
  return sendMail(db, {
    to,
    subject: `Boleta de venta · Plasma Store · #${order._id}`,
    text: `Boleta de venta #${order._id}. Total ${totalLabel}. Entrega: ${deliveryText}. Ver boleta: ${boletaUrl}`,
    html,
  });
}

/**
 * Avisa al admin/tienda de una nueva compra web pagada.
 * @param {any} db
 * @param {any} order
 */
export async function sendOrderAdminNotify(db, order) {
  const cfg = await readMailSettings(db);
  const to = resolveOrderNotifyTo(cfg);
  if (!to.includes("@")) return { ok: false, skipped: true, error: "Sin email de aviso de ventas." };
  const buyerEmail = String(order?.buyer_email || order?.fulfillment?.email || "").trim();
  const buyerName = String(order?.fulfillment?.recipient || order?.buyer_name || "").trim();
  const totalLabel = formatClpMail(order.total_cents);
  const deliveryText = orderDeliveryText(order);
  const html = adminOrderNotifyHtml({
    orderId: order._id,
    totalLabel,
    buyerName,
    buyerEmail,
    items: orderMailItems(order),
    deliveryHtml: orderDeliveryHtml(order),
  });
  return sendMail(db, {
    to,
    subject: `Nueva compra · Orden #${order._id} · ${totalLabel}`,
    text: `Nueva compra web. Orden #${order._id}. Total ${totalLabel}. Cliente: ${buyerName || "—"} <${buyerEmail || "—"}>. Entrega: ${deliveryText}.`,
    html,
  });
}

const STATUS_LABELS = {
  pending_payment: "Pendiente de pago",
  paid: "Pagada",
  processing: "En preparación",
  ready_for_pickup: "Lista para retiro",
  shipped: "En camino",
  completed: "Completada",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
  payment_failed: "Pago fallido",
};

function statusHeadline(status, order) {
  const method = String(order?.fulfillment?.method || "").toLowerCase();
  if (status === "shipped") return "Tu pedido va en camino";
  if (status === "ready_for_pickup") return "Tu pedido está listo para retirar";
  if (status === "processing" && (method === "pickup" || method === "store_pickup" || method === "retiro")) {
    return "Estamos preparando tu retiro";
  }
  if (status === "processing") return "Estamos preparando tu pedido";
  if (status === "paid") return "Confirmamos tu pago";
  if (status === "completed") return "Pedido completado";
  if (status === "cancelled") return "Pedido cancelado";
  if (status === "refunded") return "Reembolso registrado";
  return "Actualización de tu pedido";
}

/**
 * Avisa al comprador cuando cambia el estado de la orden.
 * @param {any} db
 * @param {any} order
 * @param {string} status
 * @param {string} [note]
 */
function escMail(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Envía el formulario de jugador al comprador y a la tienda (no falla la inscripción si el mail falla).
 * @param {any} db
 * @param {{
 *   buyerEmail?: string,
 *   buyerName?: string,
 *   eventTitle?: string,
 *   orderId?: number | null,
 *   registrationId?: number | null,
 *   player?: { game_tag?: string, full_name?: string, popid?: string, cl?: string, birth_year?: number }
 * }} args
 */
export async function sendEventPlayerFormMails(db, args = {}) {
  const player = args.player && typeof args.player === "object" ? args.player : {};
  const eventTitle = String(args.eventTitle || "Evento").trim() || "Evento";
  const buyerName = String(args.buyerName || player.full_name || "").trim();
  const orderId = args.orderId || null;
  const rows = [];
  if (player.full_name) rows.push(["Nombre", player.full_name]);
  if (player.popid) rows.push(["POPID", player.popid]);
  if (player.cl) rows.push(["CL", player.cl]);
  if (player.myl_race_label || player.myl_race) rows.push(["Raza", player.myl_race_label || player.myl_race]);
  if (player.birth_year) rows.push(["Año de nacimiento", String(player.birth_year)]);
  if (player.guardian_name) rows.push(["Tutor / apoderado", player.guardian_name]);
  if (player.guardian_rut) rows.push(["RUT tutor", player.guardian_rut]);
  if (player.decklist_url) rows.push(["Lista (URL)", player.decklist_url]);
  if (player.decklist_text) rows.push(["Lista", String(player.decklist_text).slice(0, 4000)]);
  if (orderId) rows.push(["Pedido", `#${orderId}`]);
  const textLines = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const htmlRows = rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escMail(k)}</td><td style="padding:4px 0"><strong>${escMail(v)}</strong></td></tr>`)
    .join("");
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
    <h2 style="margin:0 0 0.75rem">Datos de jugador</h2>
    <p>Formulario de <strong>${escMail(eventTitle)}</strong>.</p>
    <table style="border-collapse:collapse">${htmlRows}</table>
    <p style="color:#64748b;font-size:0.9rem;margin-top:1rem">Plasma Store</p>
  </div>`;

  const buyer = String(args.buyerEmail || "").trim().toLowerCase();
  const results = [];
  if (buyer.includes("@")) {
    results.push(
      await sendMail(db, {
        to: buyer,
        subject: `Datos de jugador · ${eventTitle}${orderId ? ` · #${orderId}` : ""}`,
        text: `Datos de jugador para ${eventTitle}.\n${textLines}`,
        html,
      })
    );
  }
  const cfg = await readMailSettings(db);
  const shop = resolveOrderNotifyTo(cfg);
  if (shop.includes("@") && shop !== buyer) {
    results.push(
      await sendMail(db, {
        to: shop,
        subject: `Formulario de torneo · ${eventTitle}${buyerName ? ` · ${buyerName}` : ""}`,
        text: `Nuevo formulario de jugador.\nEvento: ${eventTitle}.\nCliente: ${buyerName || "—"} <${buyer || "—"}>.\n${textLines}`,
        html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
          <h2 style="margin:0 0 0.75rem">Formulario de torneo</h2>
          <p>Cliente: <strong>${escMail(buyerName || "—")}</strong> &lt;${escMail(buyer || "—")}&gt;</p>
          <p>Evento: <strong>${escMail(eventTitle)}</strong></p>
          <table style="border-collapse:collapse">${htmlRows}</table>
        </div>`,
      })
    );
  }
  return { ok: results.some((r) => r?.ok), results };
}

/**
 * Avisa al comprador cuando cambia el estado de la orden.
 * @param {any} db
 * @param {any} order
 * @param {string} status
 * @param {string} [note]
 */
export async function sendOrderStatusUpdate(db, order, status, note = "") {
  const to = String(order?.buyer_email || order?.fulfillment?.email || "").trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, skipped: true, error: "Sin email de comprador." };
  const label = STATUS_LABELS[status] || status;
  const noteText = String(note || "").trim();
  const totalLabel = formatClpMail(order.total_cents);
  const deliveryText = orderDeliveryText(order);
  const proof = order?.shipping_proof && typeof order.shipping_proof === "object" ? order.shipping_proof : null;
  const tracking = proof?.tracking_code ? String(proof.tracking_code).trim() : "";
  let proofUrl = proof?.url && !String(proof.url).startsWith("data:") ? String(proof.url) : "";
  if (proofUrl.startsWith("/")) {
    try {
      const { readPaymentSettings } = await import("./paymentSettings.mjs");
      const pay = await readPaymentSettings(db);
      const base = String(pay?.public_base_url || process.env.PUBLIC_BASE_URL || "")
        .trim()
        .replace(/\/$/, "");
      if (base) proofUrl = `${base}${proofUrl}`;
    } catch {
      /* keep relative */
    }
  }
  const trackingHtml =
    tracking || proofUrl
      ? `<p><strong>Seguimiento:</strong>${tracking ? ` código <code>${tracking.replace(/</g, "&lt;")}</code>` : ""}${
          proofUrl ? ` · <a href="${proofUrl.replace(/"/g, "")}">ver comprobante de envío</a>` : ""
        }</p>`
      : "";
  const trackingText =
    tracking || proofUrl
      ? ` Seguimiento:${tracking ? ` ${tracking}` : ""}${proofUrl ? ` ${proofUrl}` : ""}.`
      : "";
  const headline = statusHeadline(status, order);
  const pickupHint =
    status === "ready_for_pickup"
      ? "<p>Ya puedes pasar a retirar tu pedido en tienda. Trae tu comprobante o el número de orden.</p>"
      : "";
  const shipHint =
    status === "shipped"
      ? "<p>Te avisaremos si hay novedades del envío. Revisa el seguimiento si está disponible abajo.</p>"
      : "";
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
    <h2 style="margin:0 0 0.75rem">${headline}</h2>
    <p>Tu orden <strong>#${order._id}</strong> ahora está: <strong>${label}</strong>.</p>
    ${pickupHint}${shipHint}
    ${noteText ? `<p><em>${noteText.replace(/</g, "&lt;")}</em></p>` : ""}
    ${trackingHtml}
    <p>Total: ${totalLabel}. Entrega: ${deliveryText.replace(/</g, "&lt;")}.</p>
    <p style="color:#64748b;font-size:0.9rem">Plasma Store</p>
  </div>`;
  return sendMail(db, {
    to,
    subject: `Pedido #${order._id} · ${label}`,
    text: `${headline}. Orden #${order._id}: ${label}. Total ${totalLabel}. Entrega: ${deliveryText}.${noteText ? ` Nota: ${noteText}` : ""}${trackingText}`,
    html,
  });
}
