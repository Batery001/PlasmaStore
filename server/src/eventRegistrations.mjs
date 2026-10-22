/**
 * Cupos / inscripciones a eventos (torneos).
 * El cupo se vende como producto (carrito + checkout / POS).
 */
import { nextSeq } from "./counters.mjs";
import { availableForWeb, releaseReservationsForOrder } from "./stockReservations.mjs";

export function normalizeEventRegistrationFields(row = {}) {
  const capacityRaw = parseInt(String(row.capacity ?? "0"), 10);
  const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : 0;
  const priceRaw = parseInt(String(row.price_cents ?? "0").replace(/[^\d]/g, "") || "0", 10);
  const price_cents = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;
  const cancelRaw = parseInt(String(row.cancel_hours ?? "0"), 10);
  const cancel_hours = Number.isFinite(cancelRaw) && cancelRaw > 0 ? Math.min(720, cancelRaw) : 0;
  const formHoursRaw = parseInt(String(row.player_form_hours ?? "24"), 10);
  const player_form_hours =
    Number.isFinite(formHoursRaw) && formHoursRaw >= 0 ? Math.min(168, formHoursRaw) : 24;
  const minAgeRaw = parseInt(String(row.min_age ?? "13"), 10);
  const min_age = Number.isFinite(minAgeRaw) && minAgeRaw >= 0 ? Math.min(21, minAgeRaw) : 13;
  const payment_online =
    row.payment_online !== undefined
      ? row.payment_online === true || row.payment_online === 1 || row.payment_online === "1"
      : row.payment_webpay === undefined
        ? true
        : row.payment_webpay === true || row.payment_webpay === 1 || row.payment_webpay === "1";
  const payment_webpay = payment_online;
  const payment_store =
    row.payment_store === undefined
      ? true
      : row.payment_store === true || row.payment_store === 1 || row.payment_store === "1";
  const registration_enabled =
    row.registration_enabled === true ||
    row.registration_enabled === 1 ||
    row.registration_enabled === "1";

  return {
    registration_enabled: Boolean(registration_enabled),
    capacity,
    price_cents,
    payment_webpay: Boolean(payment_webpay),
    payment_online: Boolean(payment_online),
    payment_store: Boolean(payment_store),
    cancel_hours,
    player_form_hours,
    min_age,
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
    "El cupo se agrega al carrito y se paga como un producto: en línea (TUU) o en la caja de la tienda. Si llega la hora de inicio y el cupo sigue sin pagar, se libera: se pierde."
  );
  lines.push("Un cupo por persona (misma cuenta o mismo correo). El POPID o CL no puede repetirse en el mismo torneo.");
  if (String(event?.game_tag || "").includes("mito") || event?.myl_era) {
    const bits = [event?.myl_era_label, event?.myl_event_type_label, event?.myl_deck_format_label].filter(Boolean);
    if (bits.length) {
      lines.push(
        `Formato MyL: ${bits.join(" · ")}. En el formulario después del pago eliges tu raza; puedes cambiarla hasta que empiece el torneo.`
      );
    } else {
      lines.push(
        "En el formulario después del pago eliges tu raza de Mitos y Leyendas; puedes cambiarla hasta que empiece el torneo."
      );
    }
  }
  lines.push(
    "El cupo no se transfiere a otra persona por la web. Si quieres cederlo, cancela dentro del plazo de arrepentimiento para que el otro compre, o habla con la tienda."
  );
  const formHours = Math.max(0, parseInt(String(event?.player_form_hours ?? 24), 10) || 24);
  if (formHours > 0) {
    lines.push(
      `Los datos del jugador (y la lista de mazo si el formato lo pide) hay que enviarlos hasta ${formHours} hora(s) antes del inicio. Si compras el cupo más tarde, debes completarlos antes de que empiece el evento.`
    );
  }
  const minAge = parseInt(String(event?.min_age ?? 13), 10);
  if (Number.isFinite(minAge) && minAge > 0) {
    lines.push(`Edad mínima del jugador: ${minAge} años. Si es menor de 18, hay que indicar tutor o apoderado.`);
  }
  if (event?.starts_at) {
    const when = new Date(event.starts_at);
    if (!Number.isNaN(when.getTime())) {
      lines.push(
        `Inicio del evento: ${when.toLocaleString("es-CL", { dateStyle: "full", timeStyle: "short" })}.`
      );
    }
  }
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
export function isEventProduct(row) {
  return String(row?.product_kind || "") === "event" || parseInt(String(row?.event_id ?? 0), 10) > 0;
}

export async function eventAvailability(db, event) {
  const fields = normalizeEventRegistrationFields(event);
  const taken = await countTakenCups(db, event.id ?? event._id);
  const capacity = fields.capacity;
  const pid = parseInt(String(event.product_id ?? 0), 10);
  if (Number.isFinite(pid) && pid > 0) {
    const prod = await db.collection("products").findOne({ _id: pid });
    if (prod) {
      const avail = eventHasStarted(event) ? 0 : await availableForWeb(db, prod);
      const remaining = fields.capacity > 0 ? avail : null;
      return {
        ...fields,
        taken,
        remaining,
        sold_out: fields.capacity > 0 && avail <= 0,
        product_id: pid,
      };
    }
  }
  const remaining = capacity > 0 ? Math.max(0, capacity - taken) : null;
  return {
    ...fields,
    taken,
    remaining,
    sold_out: capacity > 0 && remaining === 0,
    product_id: Number.isFinite(pid) && pid > 0 ? pid : null,
  };
}

export function eventStartMs(event) {
  const t = Date.parse(String(event?.starts_at || "").trim());
  return Number.isFinite(t) ? t : null;
}

export function eventHasStarted(event, now = new Date()) {
  const t = eventStartMs(event);
  return t != null && now.getTime() >= t;
}

/**
 * Libera cupos pending si el evento ya comenzó y no se pagó.
 * @param {any} db
 * @param {any[]} events
 */
export async function expireUnpaidEventRegistrations(db, events) {
  const now = new Date();
  const list = Array.isArray(events) ? events : [];
  let n = 0;
  for (const ev of list) {
    const t = eventStartMs(ev);
    if (t == null || t > now.getTime()) continue;
    const eid = parseInt(String(ev.id ?? ev._id), 10);
    if (!Number.isFinite(eid) || eid < 1) continue;
    const rows = await db
      .collection("event_registrations")
      .find({
        event_id: eid,
        status: { $in: ["pending_payment", "pending_store_payment"] },
      })
      .toArray();
    for (const row of rows) {
      await db.collection("event_registrations").updateOne(
        { _id: row._id },
        {
          $set: {
            status: "cancelled",
            cancel_reason: "event_started_unpaid",
            expired_at: now,
            updatedAt: now,
          },
        }
      );
      if (row.order_id) {
        await db.collection("store_orders").updateOne(
          { _id: row.order_id, status: { $in: ["pending_payment", "pending_store_payment"] } },
          { $set: { status: "cancelled", cancel_reason: "event_started_unpaid", updatedAt: now } }
        );
      }
      n += 1;
    }
  }
  return n;
}

/**
 * Cancela checkouts pendientes de un evento que ya empezó y deja el producto sin stock.
 * @param {any} db
 * @param {any[]} events
 */
export async function expireStartedEventSales(db, events) {
  const n = await expireUnpaidEventRegistrations(db, events);
  const now = new Date();
  const started = (Array.isArray(events) ? events : []).filter((ev) => eventHasStarted(ev));
  const productIds = new Set();
  for (const ev of started) {
    const pid = parseInt(String(ev.product_id ?? 0), 10);
    if (Number.isFinite(pid) && pid > 0) productIds.add(pid);
  }
  if (productIds.size) {
    const pending = await db
      .collection("store_orders")
      .find({ status: { $in: ["pending_payment", "pending_store_payment"] } })
      .toArray();
    for (const order of pending) {
      const items = Array.isArray(order.items) ? order.items : [];
      const hit = items.some((it) => productIds.has(parseInt(String(it.product_id ?? 0), 10)));
      if (!hit) continue;
      await releaseReservationsForOrder(db, order._id, "event_started_unpaid");
      await db.collection("store_orders").updateOne(
        { _id: order._id, status: { $ne: "paid" } },
        { $set: { status: "cancelled", cancel_reason: "event_started_unpaid", updatedAt: now } }
      );
    }
    for (const pid of productIds) {
      await db.collection("products").updateOne(
        { _id: pid },
        { $set: { stock: 0, active: 0, updatedAt: now } }
      );
    }
  }
  try {
    const { sendMissingEventFormReminders } = await import("./eventFormReminders.mjs");
    await sendMissingEventFormReminders(db, events);
  } catch (e) {
    console.error("[events] form reminders", e);
  }
  return n;
}

/**
 * Crea o actualiza el producto-cupo de cada evento (carrito / POS).
 * @param {any} db
 * @param {any[]} events
 * @param {{ resetStock?: boolean }} [opts]
 */
export async function syncEventProducts(db, events, opts = {}) {
  const resetStock = Boolean(opts.resetStock);
  const now = new Date();
  const list = Array.isArray(events) ? events : [];
  const keepIds = new Set();
  const out = [];

  for (const ev of list) {
    const fields = normalizeEventRegistrationFields(ev);
    const eid = parseInt(String(ev.id ?? ev._id), 10);
    if (!Number.isFinite(eid) || eid < 1) {
      out.push(ev);
      continue;
    }
    let product = null;
    const prevPid = parseInt(String(ev.product_id ?? 0), 10);
    if (Number.isFinite(prevPid) && prevPid > 0) {
      product = await db.collection("products").findOne({ _id: prevPid });
    }
    if (!product) {
      product = await db.collection("products").findOne({ event_id: eid, product_kind: "event" });
    }

    const started = eventHasStarted(ev);
    const shouldSell = Boolean(ev.active && fields.registration_enabled && String(ev.title || "").trim() && !started);
    const taken = await countTakenCups(db, eid);
    const remaining = fields.capacity > 0 ? Math.max(0, fields.capacity - taken) : shouldSell ? 9999 : 0;
    const payload = {
      name: `Cupo: ${String(ev.title || "").trim()}`,
      description: [ev.date_label, ev.place, ev.description].filter(Boolean).join(" · ").slice(0, 800),
      price_cents: fields.price_cents,
      sales_channel: "both",
      product_kind: "event",
      event_id: eid,
      category: "Evento",
      tags: ["evento", ev.game_tag].filter(Boolean),
      event_cancel_hours: fields.cancel_hours,
      event_player_form_hours: fields.player_form_hours,
      event_min_age: fields.min_age,
      event_pokemon_format: ev.pokemon_format || "",
      event_myl_era: ev.myl_era || "",
      event_myl_event_type: ev.myl_event_type || "",
      event_myl_deck_format: ev.myl_deck_format || "",
      event_game_tag: ev.game_tag || "",
      image_url: ev.image_url || null,
      image_urls: ev.image_url ? [ev.image_url] : [],
      updatedAt: now,
    };

    if (!product && !shouldSell) {
      out.push({ ...ev, product_id: null });
      continue;
    }

    if (!product) {
      const id = await nextSeq(db, "product");
      await db.collection("products").insertOne({
        _id: id,
        ...payload,
        stock: remaining,
        active: 1,
        createdAt: now,
      });
      keepIds.add(id);
      out.push({ ...ev, product_id: id });
      continue;
    }

    const $set = {
      ...payload,
      active: shouldSell ? 1 : 0,
    };
    if (!shouldSell) $set.stock = 0;
    else if (resetStock) $set.stock = remaining;
    await db.collection("products").updateOne({ _id: product._id }, { $set });
    keepIds.add(product._id);
    out.push({ ...ev, product_id: product._id });
  }

  const orphans = await db.collection("products").find({ product_kind: "event" }).toArray();
  for (const p of orphans) {
    if (!keepIds.has(p._id)) {
      await db.collection("products").updateOne(
        { _id: p._id },
        { $set: { active: 0, stock: 0, updatedAt: now } }
      );
    }
  }
  return out;
}

/**
 * @param {any} db
 * @param {{ eventId: number, eventTitle?: string, quantity: number, orderId: number, buyerEmail?: string, buyerName?: string, phone?: string, paymentMethod?: string }} args
 */
export async function recordPaidEventCups(db, args) {
  const eventId = parseInt(String(args.eventId), 10);
  const quantity = Math.max(0, parseInt(String(args.quantity ?? 0), 10) || 0);
  if (!Number.isFinite(eventId) || eventId < 1 || quantity < 1) return [];
  const now = new Date();
  const out = [];
  for (let i = 0; i < quantity; i += 1) {
    const id = await nextSeq(db, "event_registration");
    const doc = {
      _id: id,
      event_id: eventId,
      event_title: String(args.eventTitle || "").trim() || null,
      user_id: args.userId ?? null,
      guest_id: args.guestId ?? null,
      buyer_email: args.buyerEmail || null,
      buyer_name: args.buyerName || null,
      phone: args.phone || null,
      payment_method: args.paymentMethod || "tuu",
      status: args.status === "pending_store_payment" ? "pending_store_payment" : "paid",
      price_cents: Math.max(0, parseInt(String(args.price_cents ?? 0), 10) || 0),
      terms_accepted_at: now,
      order_id: args.orderId ?? null,
      paid_at: args.status === "pending_store_payment" ? null : now,
      cancel_hours: args.cancel_hours || 0,
      cancel_until: args.cancel_until || null,
      event_player: args.event_player || args.players?.[i] || null,
      popid: args.event_player?.popid || args.players?.[i]?.popid || null,
      cl: args.event_player?.cl || args.players?.[i]?.cl || null,
      player_name: args.event_player?.full_name || args.players?.[i]?.full_name || null,
      birth_year: args.event_player?.birth_year || args.players?.[i]?.birth_year || null,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("event_registrations").insertOne(doc);
    out.push(doc);
  }
  return out;
}

/**
 * @param {any} db
 * @param {any} order
 * @param {{ status?: string, paymentMethod?: string }} [args]
 */
export async function recordPaidEventCupsFromOrder(db, order, args = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const nowBuyer = {
    userId: order.user_id ?? null,
    guestId: order.guest_id ?? null,
    buyerEmail: order.buyer_email || order.fulfillment?.email || null,
    buyerName: order.buyer_name || order.fulfillment?.recipient || null,
    phone: order.fulfillment?.phone || null,
    orderId: order._id,
    paymentMethod:
      args?.paymentMethod ||
      (order.channel === "pos" || order.payment?.provider === "pos"
        ? "pos"
        : order.payment?.provider === "store"
          ? "store"
          : "tuu"),
    status: args?.status || "paid",
  };
  for (const it of items) {
    let eventId = parseInt(String(it.event_id ?? 0), 10);
    const productId = parseInt(String(it.product_id ?? 0), 10);
    if ((!Number.isFinite(eventId) || eventId < 1) && Number.isFinite(productId) && productId > 0) {
      const prod = await db.collection("products").findOne({ _id: productId }, { projection: { event_id: 1, product_kind: 1 } });
      eventId = parseInt(String(prod?.event_id ?? 0), 10);
    }
    if (!Number.isFinite(eventId) || eventId < 1) continue;
    const qty = parseInt(String(it.quantity ?? 0), 10) || 0;
    const prodMeta =
      Number.isFinite(productId) && productId > 0
        ? await db.collection("products").findOne(
            { _id: productId },
            { projection: { event_cancel_hours: 1 } }
          )
        : await db.collection("products").findOne(
            { event_id: eventId, product_kind: "event" },
            { projection: { event_cancel_hours: 1 } }
          );
    const cancelHours = Math.max(0, parseInt(String(prodMeta?.event_cancel_hours ?? 0), 10) || 0);
    const cancel_until = cancelHours > 0 ? new Date(Date.now() + cancelHours * 60 * 60 * 1000).toISOString() : null;
    await recordPaidEventCups(db, {
      ...nowBuyer,
      eventId,
      eventTitle: String(it.name || "").replace(/^Cupo:\s*/i, ""),
      quantity: qty,
      price_cents: it.price_cents,
      status: nowBuyer.status,
      paymentMethod: nowBuyer.paymentMethod,
      event_player: it.event_player || null,
      cancel_hours: cancelHours,
      cancel_until,
    });
  }
}
