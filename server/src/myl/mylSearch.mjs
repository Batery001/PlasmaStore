/**
 * Búsqueda de cartas MyL vía API pública de TOR (api.myl.cl).
 * Docs implícitas: POST /cards/search · GET /cards/edition/:slug
 */

const MYL_API = "https://api.myl.cl";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 40;

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
 * @param {string} typeId
 */
export function mylTypeFromId(typeId) {
  return MYL_TYPES[String(typeId)] || { slug: "otro", name: "Otro" };
}

/**
 * @param {string} editionId
 * @param {string} edid
 */
export function mylCardImageUrl(editionId, edid) {
  const ed = String(editionId || "").trim();
  const num = String(edid || "").trim().padStart(3, "0");
  if (!ed || !num) return "";
  return `${MYL_API}/static/cards/${ed}/${num}.png`;
}

/**
 * @param {{ query: string, type?: string }} opts
 */
export async function searchMylCards(opts) {
  const query = String(opts.query || "").trim();
  if (query.length < 2) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
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
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn("[myl] search HTTP", res.status);
      return [];
    }
    const json = await res.json();
    if (json?.status !== "OK" || !Array.isArray(json.cards)) return [];

    const typeFilter = String(opts.type || "all").trim().toLowerCase();
    /** @type {Array<Record<string, unknown>>} */
    let cards = json.cards;
    if (typeFilter && typeFilter !== "all") {
      cards = cards.filter((c) => mylTypeFromId(String(c.type)).slug === typeFilter);
    }

    return cards.slice(0, MAX_RESULTS).map((c) => {
      const typeMeta = mylTypeFromId(String(c.type));
      const editionId = String(c.edition || "");
      const edid = String(c.edid || "");
      return {
        id: String(c.id || `${editionId}-${edid}`),
        name: String(c.name || "").trim(),
        slug: String(c.slug || ""),
        type: typeMeta.slug,
        typeLabel: typeMeta.name,
        editionId,
        editionSlug: String(c.edition_slug || ""),
        edid,
        image: mylCardImageUrl(editionId, edid),
      };
    });
  } catch (e) {
    console.warn("[myl] search failed", e instanceof Error ? e.message : e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
