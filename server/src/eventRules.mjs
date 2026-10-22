import { eventHasStarted, eventStartMs } from "./eventRegistrations.mjs";
import { eventNeedsDecklist, playerFormHours } from "./eventFormats.mjs";
import { eventNeedsPlayerForm, eventPlayerFormComplete, playerSnapshotFromReg } from "./eventPlayer.mjs";

const ACTIVE = { $in: ["pending_payment", "pending_store_payment", "paid"] };

export function formDeadlineMs(event, registration) {
  const start = eventStartMs(event);
  if (start == null) return null;
  const hours = playerFormHours(event);
  const hard = start - hours * 60 * 60 * 1000;
  const created = Date.parse(String(registration?.createdAt || ""));
  if (Number.isFinite(created) && created > hard) return start;
  return hard;
}

export function playerFormOpen(event, registration, now = new Date()) {
  if (eventHasStarted(event, now)) return false;
  const d = formDeadlineMs(event, registration);
  if (d == null) return true;
  return now.getTime() < d;
}

/** MyL: la raza se puede cambiar hasta que empiece el torneo. */
export function playerRaceEditable(event, registration, now = new Date()) {
  if (!event || eventHasStarted(event, now)) return false;
  const status = String(registration?.status || "");
  if (status === "cancelled" || status === "expired" || status === "refunded") return false;
  const tag = String(event?.game_tag || registration?.event_player?.game_tag || "");
  return tag === "mitos-y-leyendas" || tag.includes("mito");
}

/** Si se pueden guardar/actualizar datos del jugador ahora. */
export function playerDataEditable(event, registration, now = new Date()) {
  if (playerRaceEditable(event, registration, now)) return true;
  return playerFormOpen(event, registration, now);
}

export function playerAgeAt(event, player, user) {
  const at = eventStartMs(event) != null ? new Date(eventStartMs(event)) : new Date();
  const year = parseInt(String(player?.birth_year ?? user?.birth_year ?? ""), 10);
  if (!Number.isFinite(year) || year < 1900) return null;
  const month = parseInt(String(user?.birth_month ?? 12), 10) || 12;
  const day = parseInt(String(user?.birth_day ?? 31), 10) || 31;
  let age = at.getFullYear() - year;
  const m = at.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && at.getDate() < day)) age -= 1;
  return age;
}

export function playerNeedsGuardian(event, player, user) {
  const age = playerAgeAt(event, player, user);
  return age != null && age < 18;
}

export function eventFormIsComplete(event, row, user) {
  const tag = event?.game_tag || row?.event_player?.game_tag;
  if (!eventNeedsPlayerForm(tag)) {
    if (eventNeedsDecklist(event)) {
      const text = String(row?.decklist_text || row?.event_player?.decklist_text || "").trim();
      const url = String(row?.decklist_url || row?.event_player?.decklist_url || "").trim();
      return Boolean(text || url);
    }
    return true;
  }
  const player = playerSnapshotFromReg(row, tag);
  if (!eventPlayerFormComplete(tag, player)) return false;
  if (eventNeedsDecklist(event)) {
    const text = String(row?.decklist_text || player.decklist_text || "").trim();
    const url = String(row?.decklist_url || player.decklist_url || "").trim();
    if (!text && !url) return false;
  }
  if (playerNeedsGuardian(event, player, user || row)) {
    if (!String(row?.guardian_name || player.guardian_name || "").trim()) return false;
  }
  return true;
}

export function canCustomerCancelRegistration(event, row, now = new Date()) {
  if (!row || row.status === "cancelled" || row.status === "refunded" || row.status === "expired") return false;
  if (eventHasStarted(event, now)) return false;
  const until = Date.parse(String(row.cancel_until || ""));
  if (!Number.isFinite(until) || until <= 0) return false;
  return now.getTime() < until;
}

export async function findActiveCupForPerson(db, eventId, { userId, email, excludeRegId } = {}) {
  const eid = parseInt(String(eventId), 10);
  if (!Number.isFinite(eid) || eid < 1) return null;
  const or = [];
  if (userId) or.push({ user_id: userId });
  const mail = String(email || "").trim().toLowerCase();
  if (mail.includes("@")) or.push({ buyer_email: mail });
  if (!or.length) return null;
  const filter = { event_id: eid, status: ACTIVE, $or: or };
  if (excludeRegId) filter._id = { $ne: excludeRegId };
  return db.collection("event_registrations").findOne(filter);
}

export async function findDuplicatePlayerCode(db, { eventId, excludeRegId, popid, cl }) {
  const eid = parseInt(String(eventId), 10);
  if (!Number.isFinite(eid) || eid < 1) return null;
  const or = [];
  const p = String(popid || "").trim().toUpperCase();
  const c = String(cl || "").trim().toUpperCase();
  if (p) or.push({ popid: p });
  if (c) or.push({ cl: c });
  if (!or.length) return null;
  const filter = { event_id: eid, status: ACTIVE, $or: or };
  if (excludeRegId) filter._id = { $ne: excludeRegId };
  return db.collection("event_registrations").findOne(filter);
}

export async function assertUserCanTakeEventCup(db, event, { userId, email }) {
  if (!event) return;
  const taken = await findActiveCupForPerson(db, event.id ?? event._id, { userId, email });
  if (taken) {
    throw Object.assign(new Error("Ya tienes un cupo en este torneo. Un cupo por persona."), { status: 409 });
  }
}

export async function releaseEventRegistration(db, prev, reason) {
  if (!prev || prev.status === "cancelled" || prev.status === "refunded") {
    return { ok: false, error: "Inscripción no activa." };
  }
  const now = new Date();
  await db.collection("event_registrations").updateOne(
    { _id: prev._id },
    {
      $set: {
        status: "cancelled",
        cancel_reason: String(reason || "cancel").slice(0, 120),
        cancelled_at: now,
        updatedAt: now,
      },
    }
  );
  const prod = await db.collection("products").findOne({ event_id: prev.event_id, product_kind: "event" });
  if (prod) {
    await db.collection("products").updateOne({ _id: prod._id }, { $inc: { stock: 1 }, $set: { updatedAt: now } });
  }
  if (prev.order_id && (prev.status === "pending_store_payment" || prev.status === "pending_payment")) {
    await db.collection("store_orders").updateOne(
      { _id: prev.order_id, status: { $in: ["pending_store_payment", "pending_payment"] } },
      { $set: { status: "cancelled", cancel_reason: String(reason || "cancel").slice(0, 120), updatedAt: now } }
    );
  }
  return { ok: true };
}
