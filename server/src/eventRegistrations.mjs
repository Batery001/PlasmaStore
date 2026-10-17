/**
 * Cupos / inscripciones a eventos (torneos).
 * Una sola fuente de verdad: no se vende cupo por WhatsApp.
 */

export function normalizeEventRegistrationFields(row = {}) {
  const capacityRaw = parseInt(String(row.capacity ?? "0"), 10);
  const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : 0;
  const priceRaw = parseInt(String(row.price_cents ?? "0").replace(/[^\d]/g, "") || "0", 10);
  const price_cents = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;
  const cancelRaw = parseInt(String(row.cancel_hours ?? "0"), 10);
  const cancel_hours = Number.isFinite(cancelRaw) && cancelRaw > 0 ? Math.min(720, cancelRaw) : 0;
  const payment_webpay =
    row.payment_webpay === undefined
      ? true
      : row.payment_webpay === true || row.payment_webpay === 1 || row.payment_webpay === "1";
  const payment_store =
    row.payment_store === true || row.payment_store === 1 || row.payment_store === "1";
  const registration_enabled =
    row.registration_enabled === true ||
    row.registration_enabled === 1 ||
    row.registration_enabled === "1";

  return {
    registration_enabled: Boolean(registration_enabled),
    capacity,
    price_cents,
    payment_webpay: Boolean(payment_webpay),
    payment_store: Boolean(payment_store),
    cancel_hours,
    terms_extra: String(row.terms_extra || "").trim().slice(0, 2000),
  };
}

/**
 * Texto de términos según config del evento.
 * @param {{ title?: string, cancel_hours?: number, terms_extra?: string, price_cents?: number }} event
 */
export function buildEventTermsText(event) {
  const title = String(event?.title || "este evento").trim();
  const cancelHours = Math.max(0, parseInt(String(event?.cancel_hours ?? 0), 10) || 0);
  const price = Math.max(0, parseInt(String(event?.price_cents ?? 0), 10) || 0);
  const lines = [
    `Al comprar un cupo para “${title}” aceptas que la inscripción y el pago se gestionan solo por Plasma Store (la página), no por WhatsApp.`,
    price > 0
      ? `El valor del cupo es $${price.toLocaleString("es-CL")} CLP.`
      : "Este cupo no tiene costo de inscripción.",
  ];
  if (cancelHours > 0) {
    lines.push(
      `Tienes ${cancelHours} hora(s) desde la confirmación de la inscripción para cancelar y liberar el cupo.`,
      `Pasado ese plazo, el cupo queda reservado de forma definitiva: llegues o no al evento, el cupo no se libera ni se reembolsa.`
    );
  } else {
    lines.push(
      "Esta inscripción no contempla ventana de arrepentimiento: al confirmar, el cupo queda reservado según las reglas del evento."
    );
  }
  lines.push(
    "Si eliges pago en tienda, el cupo se reserva al inscribirte y debes completar el pago en el local según las indicaciones de Plasma Store."
  );
  const extra = String(event?.terms_extra || "").trim();
  if (extra) lines.push(extra);
  return lines.join("\n\n");
}

/**
 * @param {any} db
 * @param {number} eventId
 */
export async function countTakenCups(db, eventId) {
  const eid = parseInt(String(eventId), 10);
  if (!Number.isFinite(eid) || eid < 1) return 0;
  return db.collection("event_registrations").countDocuments({
    event_id: eid,
    status: { $in: ["pending_payment", "pending_store_payment", "paid"] },
  });
}

/**
 * @param {any} db
 * @param {any} event
 */
export async function eventAvailability(db, event) {
  const fields = normalizeEventRegistrationFields(event);
  const taken = await countTakenCups(db, event.id ?? event._id);
  const capacity = fields.capacity;
  const remaining = capacity > 0 ? Math.max(0, capacity - taken) : null;
  return {
    ...fields,
    taken,
    remaining,
    sold_out: capacity > 0 && remaining === 0,
  };
}
