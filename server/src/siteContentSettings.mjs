import {
  buildEventTermsText,
  eventAvailability,
  eventHasStarted,
  expireStartedEventSales,
  normalizeEventRegistrationFields,
  syncEventProducts,
} from "./eventRegistrations.mjs";
import { eventGameTagLabel, normalizeEventGameTag } from "./eventGameTags.mjs";
import {
  mylDeckFormatLabel,
  mylEraLabel,
  mylEventTypeLabel,
  normalizeMylDeckFormat,
  normalizeMylEra,
  normalizeMylEventType,
  normalizePokemonFormat,
  pokemonFormatLabel,
} from "./eventFormats.mjs";

export const SITE_CONTENT_ID = "site_content";

const SOCIAL_KEYS = ["facebook", "instagram", "youtube", "whatsapp"];

function normalizeSocial(key, raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  const enabled = row.enabled === true || row.enabled === 1 || row.enabled === "1";
  let url = String(row.url || "").trim().slice(0, 400);
  let phone = String(row.phone || "").trim().replace(/[^\d+]/g, "").slice(0, 20);
  if (key === "whatsapp") {
    if (!url && phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits) url = `https://wa.me/${digits}`;
    }
  } else if (url && !/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return {
    enabled: Boolean(enabled),
    url,
    ...(key === "whatsapp" ? { phone } : {}),
  };
}

function defaultSocials() {
  return {
    facebook: { enabled: false, url: "" },
    instagram: { enabled: false, url: "" },
    youtube: { enabled: false, url: "" },
    whatsapp: { enabled: false, url: "", phone: "" },
  };
}

function normalizeEvent(raw, idx = 0) {
  const row = raw && typeof raw === "object" ? raw : {};
  const id =
    Number.isFinite(Number(row.id)) && Number(row.id) > 0
      ? Math.floor(Number(row.id))
      : idx + 1;
  const reg = normalizeEventRegistrationFields(row);
  const productIdRaw = parseInt(String(row.product_id ?? 0), 10);
  const product_id = Number.isFinite(productIdRaw) && productIdRaw > 0 ? productIdRaw : null;
  const startsRaw = String(row.starts_at || "").trim();
  const startsParsed = Date.parse(startsRaw);
  const starts_at = Number.isFinite(startsParsed) ? new Date(startsParsed).toISOString() : "";
  let date_label = String(row.date_label || row.date || "").trim().slice(0, 80);
  if (!date_label && starts_at) {
    date_label = new Date(starts_at).toLocaleString("es-CL", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return {
    id,
    title: String(row.title || "").trim().slice(0, 120),
    game_tag: normalizeEventGameTag(row.game_tag || row.tag || row.game),
    game_tag_label: eventGameTagLabel(row.game_tag || row.tag || row.game),
    pokemon_format: normalizePokemonFormat(row.pokemon_format || row.format),
    pokemon_format_label: pokemonFormatLabel(row.pokemon_format || row.format),
    myl_era: normalizeMylEra(row.myl_era),
    myl_era_label: mylEraLabel(row.myl_era),
    myl_event_type: normalizeMylEventType(row.myl_event_type),
    myl_event_type_label: mylEventTypeLabel(row.myl_event_type),
    myl_deck_format: normalizeMylDeckFormat(row.myl_deck_format),
    myl_deck_format_label: mylDeckFormatLabel(row.myl_deck_format),
    product_id,
    starts_at,
    date_label,
    place: String(row.place || "").trim().slice(0, 120),
    description: String(row.description || "").trim().slice(0, 800),
    image_url: row.image_url != null ? String(row.image_url).trim().slice(0, 600) : "",
    link: String(row.link || "").trim().slice(0, 400),
    active: row.active !== false && row.active !== 0 && row.active !== "0",
    ...reg,
  };
}

/**
 * @param {any} db
 */
export async function readSiteContent(db) {
  const row = await db.collection("store_settings").findOne({ _id: SITE_CONTENT_ID });
  const cfg = row && typeof row === "object" ? row : {};
  const socialsIn = cfg.socials && typeof cfg.socials === "object" ? cfg.socials : {};
  const socials = defaultSocials();
  for (const key of SOCIAL_KEYS) {
    socials[key] = normalizeSocial(key, socialsIn[key]);
  }

  const aboutIn = cfg.about && typeof cfg.about === "object" ? cfg.about : {};
  const homeCardsIn = cfg.home_cards && typeof cfg.home_cards === "object" ? cfg.home_cards : {};
  const eventsIn = cfg.events && typeof cfg.events === "object" ? cfg.events : {};
  const itemsRaw = Array.isArray(eventsIn.items) ? eventsIn.items : [];

  return {
    singles_enabled: cfg.singles_enabled === true || cfg.singles_enabled === 1,
    socials,
    about: {
      enabled: aboutIn.enabled !== false && aboutIn.enabled !== 0 && aboutIn.enabled !== "0",
      title: String(aboutIn.title || "Quiénes somos").trim().slice(0, 80) || "Quiénes somos",
      body:
        aboutIn.body != null
          ? String(aboutIn.body).trim().slice(0, 4000)
          : "Somos Plasma Store: cartas, sellados y una comunidad gamer en Chile. Pronto más novedades.",
    },
    home_cards: {
      sealed_image_url: String(homeCardsIn.sealed_image_url || "").trim().slice(0, 800),
      events_image_url: String(homeCardsIn.events_image_url || "").trim().slice(0, 800),
    },
    events: {
      enabled: eventsIn.enabled !== false && eventsIn.enabled !== 0 && eventsIn.enabled !== "0",
      title: String(eventsIn.title || "Eventos").trim().slice(0, 80) || "Eventos",
      subtitle:
        String(eventsIn.subtitle || "Torneos, lanzamientos y encuentros").trim().slice(0, 160) ||
        "Torneos, lanzamientos y encuentros",
      items: itemsRaw.map((it, i) => normalizeEvent(it, i)).slice(0, 20),
    },
    updatedAt: cfg.updatedAt || null,
  };
}

/**
 * @param {any} db
 * @param {Record<string, unknown>} body
 */
export async function saveSiteContent(db, body) {
  const prev = await readSiteContent(db);
  const next = { ...prev };

  if (body.singles_enabled !== undefined) {
    next.singles_enabled =
      body.singles_enabled === true || body.singles_enabled === 1 || body.singles_enabled === "1";
  }

  if (body.socials && typeof body.socials === "object") {
    const socials = defaultSocials();
    for (const key of SOCIAL_KEYS) {
      const incoming = body.socials[key] !== undefined ? body.socials[key] : prev.socials[key];
      socials[key] = normalizeSocial(key, incoming);
    }
    next.socials = socials;
  }

  if (body.about && typeof body.about === "object") {
    const a = body.about;
    next.about = {
      enabled:
        a.enabled !== undefined
          ? a.enabled === true || a.enabled === 1 || a.enabled === "1"
          : prev.about.enabled,
      title:
        a.title !== undefined
          ? String(a.title || "").trim().slice(0, 80) || "Quiénes somos"
          : prev.about.title,
      body: a.body !== undefined ? String(a.body || "").trim().slice(0, 4000) : prev.about.body,
    };
  }

  if (body.home_cards && typeof body.home_cards === "object") {
    const h = body.home_cards;
    next.home_cards = {
      sealed_image_url:
        h.sealed_image_url !== undefined
          ? String(h.sealed_image_url || "").trim().slice(0, 800)
          : prev.home_cards.sealed_image_url,
      events_image_url:
        h.events_image_url !== undefined
          ? String(h.events_image_url || "").trim().slice(0, 800)
          : prev.home_cards.events_image_url,
    };
  }

  if (body.events && typeof body.events === "object") {
    const e = body.events;
    const itemsSrc = Array.isArray(e.items) ? e.items : prev.events.items;
    next.events = {
      enabled:
        e.enabled !== undefined
          ? e.enabled === true || e.enabled === 1 || e.enabled === "1"
          : prev.events.enabled,
      title:
        e.title !== undefined
          ? String(e.title || "").trim().slice(0, 80) || "Eventos"
          : prev.events.title,
      subtitle:
        e.subtitle !== undefined
          ? String(e.subtitle || "").trim().slice(0, 160)
          : prev.events.subtitle,
      items: itemsSrc.map((it, i) => normalizeEvent(it, i)).slice(0, 20),
    };
  }

  const now = new Date();
  const doc = {
    _id: SITE_CONTENT_ID,
    singles_enabled: Boolean(next.singles_enabled),
    socials: next.socials,
    about: next.about,
    home_cards: next.home_cards,
    events: next.events,
    updatedAt: now,
  };
  await db.collection("store_settings").replaceOne({ _id: SITE_CONTENT_ID }, doc, { upsert: true });
  const syncedItems = await syncEventProducts(db, next.events.items, { resetStock: Boolean(body.events) });
  const nextItems = syncedItems.map((it, i) => normalizeEvent(it, i));
  doc.events = { ...next.events, items: nextItems };
  await db.collection("store_settings").replaceOne({ _id: SITE_CONTENT_ID }, doc, { upsert: true });
  return readSiteContent(db);
}

/**
 * Vista pública (solo lo activo) + cupos restantes.
 * @param {any} db
 */
export async function publicSiteContent(db) {
  const full = await readSiteContent(db);
  const socials = {};
  for (const key of SOCIAL_KEYS) {
    const s = full.socials[key];
    if (s.enabled && (s.url || (key === "whatsapp" && s.phone))) {
      socials[key] = {
        enabled: true,
        url: s.url || (s.phone ? `https://wa.me/${String(s.phone).replace(/\D/g, "")}` : ""),
      };
    }
  }

  const activeItems = full.events.items.filter((it) => it.active && it.title);
  await expireStartedEventSales(db, full.events.items);
  const synced = await syncEventProducts(db, activeItems, { resetStock: false });
  const items = [];
  for (const it of synced) {
    const avail = await eventAvailability(db, it);
    const started = eventHasStarted(it);
    items.push({
      ...it,
      taken: avail.taken,
      remaining: avail.remaining,
      sold_out: avail.sold_out,
      started,
      terms_text: buildEventTermsText(it),
    });
  }

  return {
    singles_enabled: Boolean(full.singles_enabled),
    socials,
    about: full.about.enabled
      ? { enabled: true, title: full.about.title, body: full.about.body }
      : { enabled: false, title: full.about.title, body: "" },
    home_cards: full.home_cards,
    events: full.events.enabled
      ? {
          enabled: true,
          title: full.events.title,
          subtitle: full.events.subtitle,
          items,
        }
      : { enabled: false, title: full.events.title, subtitle: full.events.subtitle, items: [] },
  };
}

/**
 * @param {any} db
 * @param {number} eventId
 */
export async function findEventById(db, eventId) {
  const full = await readSiteContent(db);
  const id = parseInt(String(eventId), 10);
  if (!Number.isFinite(id) || id < 1) return null;
  return full.events.items.find((it) => it.id === id) || null;
}
