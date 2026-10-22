import { sendMail } from "./mailer.mjs";
import { eventFormIsComplete, formDeadlineMs, playerFormOpen } from "./eventRules.mjs";
import { eventNeedsDecklist } from "./eventFormats.mjs";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Un recordatorio si faltan datos y se acerca el tope del formulario.
 * Se dispara en las mismas peticiones que vencen cupos impagos.
 */
export async function sendMissingEventFormReminders(db, events) {
  const now = new Date();
  const list = Array.isArray(events) ? events : [];
  let n = 0;
  for (const ev of list) {
    const eid = parseInt(String(ev.id ?? ev._id), 10);
    if (!Number.isFinite(eid) || eid < 1) continue;
    const rows = await db
      .collection("event_registrations")
      .find({
        event_id: eid,
        status: { $in: ["pending_store_payment", "paid"] },
      })
      .limit(120)
      .toArray();
    for (const row of rows) {
      if (row.form_reminder_sent_at) continue;
      if (eventFormIsComplete(ev, row)) continue;
      if (!playerFormOpen(ev, row, now)) continue;
      const deadline = formDeadlineMs(ev, row);
      if (deadline == null) continue;
      const sixH = 6 * 60 * 60 * 1000;
      if (now.getTime() < deadline - sixH) continue;
      const to = String(row.buyer_email || "").trim().toLowerCase();
      if (!to.includes("@")) continue;
      const when = new Date(deadline).toLocaleString("es-CL", { dateStyle: "full", timeStyle: "short" });
      const extra = eventNeedsDecklist(ev) ? " y tu lista de mazo" : "";
      const base = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
      const link = base ? `${base}/perfil` : "/perfil";
      const sent = await sendMail(db, {
        to,
        subject: `Te faltan los datos · ${ev.title || "Evento"}`,
        text: `Todavía no recibimos tus datos de jugador${extra} para “${ev.title || "el evento"}”. Envíalos en tu perfil antes del ${when}. ${link}`,
        html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
          <h2 style="margin:0 0 0.75rem">Te faltan los datos</h2>
          <p>Aún no está completo el formulario de <strong>${esc(ev.title || "el evento")}</strong>${esc(extra)}.</p>
          <p>Tienes hasta el <strong>${esc(when)}</strong>.</p>
          <p><a href="${esc(link)}">Completar en mi perfil</a></p>
          <p style="color:#64748b;font-size:0.9rem">Plasma Store</p>
        </div>`,
      });
      if (sent?.ok) {
        await db.collection("event_registrations").updateOne(
          { _id: row._id },
          { $set: { form_reminder_sent_at: now, updatedAt: now } }
        );
        n += 1;
      }
    }
  }
  return n;
}
