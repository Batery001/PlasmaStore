/**
 * Búsqueda / catálogo MyL vía API pública de TOR (api.myl.cl).
 */
import {
  MYL_DECK_FORMATS,
  MYL_ERAS,
  mylRacesForEra,
  normalizeMylDeckFormat,
  normalizeMylEra,
  normalizeMylRace,
} from "../eventFormats.mjs";
import {
  MYL_EDITION_GROUPS,
  MYL_SEED_EDITIONS,
  cardMatchesRaceProfile,
  getMylRaceProfile,
} from "./mylRaceProfiles.mjs";

const MYL_API = "https://api.myl.cl";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_RESULTS = 60;
const EDITION_CACHE_MS = 1000 * 60 * 60 * 6;

/** @type {Map<string, { at: number, payload: any }>} */
const editionCache = new Map();

/** @type {Record<string, { slug: string, name: string }>} */
export const MYL_TYPES = {
  "1": { slug: "aliado", name: "Aliado" },
  "2": { slug: "talisman", name: "Talismán" },
  "3": { slug: "arma", name: "Arma" },
  "4": { slug: "totem", name: "Tótem" },
  "5": { slug: "oro", name: "Oro" },
  "6": { slug: "monumento", name: "Monumento" },
};

/**
 * @param {string} slug
 * @param {"primera-era"|"primer-bloque"|""} era
 */
export function editionMatchesEra(slug, era) {
  const s = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (!era) return true;

  if (era === "primera-era") {
    if (/(^|_)pe($|_)|primera|el_reto|mundo_gotico|nahual|ragnarok|cofradia|espiritu|xinnian|mundos_perdidos|leyendas_pe|extension_pe|xtension_pe|vigilantes_de_la_noche|lootbox_pe|toolkit.*(odin|walkiria|justa|valhalla|honor|ferocidad|valentia|desolacion)/i.test(s)) {
      return true;
    }
    if (/^(el_reto|mundo_gotico|ira_del_nahual|ragnarok|la_cofradia|espiritu_del_dragon|raciales)$/.test(s)) {
      return true;
    }
    return false;
  }

  if (era === "primer-bloque") {
    if (/(^|_)pb($|_)|lpb|espada|cruzadas|helenic|hijos_de_daana|tierras_altas|dominios|encrucijada|raciales_pb|shogun|dracula|inferno|leyendas_pb|leyendas_2|leyendas_3|leyendas_4|toolkit.*(fe|dragon|magia|fuerza|destino)/i.test(s)) {
      return true;
    }
    if (s === "imperio" || s.startsWith("imperio_")) return true;
    if (/onyria|kaiju|mecha|giger|napoleon|bestiarium|excalibur|troya|furia|sumeria|asgard|midgard|camelot|bushido/.test(s)) {
      return false;
    }
    return false;
  }

  return true;
}

export function mylTypeFromId(typeId) {
  return MYL_TYPES[String(typeId)] || { slug: "otro", name: "Otro" };
}

export function mylCardImageUrl(editionId, edid) {
  const ed = String(editionId || "").trim();
  const num = String(edid || "").trim().padStart(3, "0");
  if (!ed || !num) return "";
  return `${MYL_API}/static/cards/${ed}/${num}.png`;
}

/**
 * @param {string} slug
 * @param {AbortSignal} [signal]
 */
async function fetchEdition(slug, signal) {
  const key = String(slug || "").trim();
  if (!key) return null;
  const cached = editionCache.get(key);
  if (cached && Date.now() - cached.at < EDITION_CACHE_MS) return cached.payload;

  const res = await fetch(`${MYL_API}/cards/edition/${encodeURIComponent(key)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.status !== "OK") return null;
  editionCache.set(key, { at: Date.now(), payload: json });
  return json;
}

/**
 * @param {string} era
 * @param {AbortSignal} [signal]
 */
async function loadEraCatalog(era, signal) {
  const seeds = MYL_SEED_EDITIONS[era] || [];
  /** @type {Map<string, any>} */
  const byId = new Map();
  /** @type {Map<string, string>} */
  const raceIdToSlug = new Map();

  const settled = await Promise.allSettled(seeds.map((slug) => fetchEdition(slug, signal)));
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status !== "fulfilled" || !result.value) continue;
    const ed = result.value;
    const slug = seeds[i];
    for (const r of ed.races || []) {
      raceIdToSlug.set(String(r.id), String(r.slug || ""));
    }
    const editionId = String(ed.edition?.id || "");
    const editionSlug = String(ed.edition?.slug || slug);
    for (const c of ed.cards || []) {
      const id = String(c.id || `${editionId}-${c.edid}-${c.slug}`);
      if (byId.has(id)) continue;
      byId.set(id, {
        ...c,
        edition: editionId || c.ed_edid || c.edition,
        edition_slug: editionSlug,
        ed_slug: editionSlug,
      });
    }
  }

  return { cards: [...byId.values()], raceIdToSlug };
}

/**
 * @param {AbortSignal} [signal]
 * @param {string} query
 */
async function postSearch(query, signal) {
  const body = new URLSearchParams();
  body.set("entry", query);
  body.set("uuid", "");
  const res = await fetch(`${MYL_API}/cards/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
    },
    body: body.toString(),
    signal,
  });
  if (!res.ok) return [];
  const json = await res.json();
  if (json?.status !== "OK" || !Array.isArray(json.cards)) return [];
  return json.cards;
}

function mapCard(c, era, race) {
  const typeMeta = mylTypeFromId(String(c.type));
  const editionId = String(c.edition || c.ed_edid || "");
  const edid = String(c.edid || "");
  return {
    id: String(c.id || `${editionId}-${edid}`),
    name: String(c.name || "").trim(),
    slug: String(c.slug || ""),
    type: typeMeta.slug,
    typeLabel: typeMeta.name,
    editionId,
    editionSlug: String(c.edition_slug || c.ed_slug || ""),
    edid,
    image: mylCardImageUrl(editionId, edid),
    era: era || null,
    race: race || null,
    torRace: c.race != null ? String(c.race) : null,
  };
}

/**
 * @param {{ query?: string, type?: string, era?: string, race?: string, deckFormat?: string }} opts
 */
export async function searchMylCards(opts) {
  const era = normalizeMylEra(opts.era);
  const race = normalizeMylRace(opts.race, era);
  const typeFilter = String(opts.type || "all").trim().toLowerCase() || "all";
  const userQuery = String(opts.query || "").trim();
  const deckFormat = normalizeMylDeckFormat(opts.deckFormat) || "soporte-libre";
  const profile = race ? getMylRaceProfile(race) : null;
  const isLibre = deckFormat === "libre";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    /** @type {any[]} */
    let cards = [];

    if (era && (profile || isLibre)) {
      const { cards: catalog, raceIdToSlug } = await loadEraCatalog(era, controller.signal);

      if (isLibre && !profile) {
        cards = catalog.slice();
      } else if (profile) {
        // En libre con raza opcional, filtramos como soporte-libre (sin restricción de edición hogar).
        const effectiveFormat = isLibre ? "soporte-libre" : deckFormat;
        const allies = catalog.filter((c) =>
          cardMatchesRaceProfile(c, profile, raceIdToSlug, { deckFormat: effectiveFormat, forSupport: false })
        );
        const support = catalog.filter((c) => {
          if (String(c.type) === "1") return false;
          return cardMatchesRaceProfile(c, profile, raceIdToSlug, {
            deckFormat: effectiveFormat,
            forSupport: true,
          });
        });
        const seen = new Set();
        cards = [];
        for (const c of [...allies, ...support]) {
          const id = String(c.id);
          if (seen.has(id)) continue;
          seen.add(id);
          cards.push(c);
        }
      } else {
        cards = catalog.slice();
      }
    } else if (userQuery.length >= 2) {
      const batch = await postSearch(userQuery, controller.signal);
      cards = batch.filter((c) => !era || editionMatchesEra(String(c.edition_slug || ""), era));
    } else {
      return [];
    }

    if (userQuery.length >= 2) {
      const q = userQuery.toLowerCase();
      cards = cards.filter((c) => String(c.name || "").toLowerCase().includes(q));
    }

    if (typeFilter && typeFilter !== "all") {
      cards = cards.filter((c) => mylTypeFromId(String(c.type)).slug === typeFilter);
    }

    cards.sort((a, b) => {
      const at = String(a.type) === "1" ? 0 : 1;
      const bt = String(b.type) === "1" ? 0 : 1;
      if (at !== bt) return at - bt;
      return String(a.name || "").localeCompare(String(b.name || ""), "es");
    });

    return cards.slice(0, MAX_RESULTS).map((c) => mapCard(c, era, race));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Abort = otra búsqueda o timeout: no devolver [] “falso vacío” al cliente.
    if (e?.name === "AbortError" || /aborted/i.test(msg)) {
      console.warn("[myl] search aborted", msg);
      throw e;
    }
    console.warn("[myl] search failed", msg);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function mylMeta(eraRaw) {
  const era = normalizeMylEra(eraRaw) || "";
  const races = mylRacesForEra(era || undefined).map((r) => {
    const profile = getMylRaceProfile(r.slug);
    const home = profile?.homeGroup ? MYL_EDITION_GROUPS[profile.homeGroup] : null;
    return {
      slug: r.slug,
      name: r.name,
      hint: profile?.hint || "",
      homeLabel: home?.label || "",
    };
  });
  return {
    eras: MYL_ERAS,
    era: era || null,
    races,
    deckFormats: MYL_DECK_FORMATS.map((f) => ({
      slug: f.slug,
      name: f.name,
      hint: f.hint || "",
    })),
    rules: {
      deckSize: 50,
      maxCopies: 3,
      minAlliesRacial: 16,
    },
  };
}
