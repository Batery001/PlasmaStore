/**
 * Búsqueda de cartas vía TCGdex (incluye MEP / promos que pokemontcg.io aún no tiene).
 */
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const FETCH_TIMEOUT_MS = 10_000;
const BRIEF_CANDIDATES = 120;
const FETCH_BATCH = 24;
const MAX_RESULTS = 28;

/** Limitless/PTCGL ← id TCGdex (subset usado en mazos). */
const TCGDEX_TO_LIMITLESS = {
  sv01: "SVI",
  sv02: "PAL",
  sv03: "OBF",
  "sv03.5": "MEW",
  sv04: "PAR",
  "sv04.5": "PAF",
  sv05: "TEF",
  sv06: "TWM",
  "sv06.5": "SFA",
  sv07: "SCR",
  sv08: "SSP",
  "sv08.5": "PRE",
  sv09: "JTG",
  sv10: "DRI",
  "sv10.5b": "BLK",
  "sv10.5w": "WHT",
  svp: "SVP",
  sve: "SVE",
  me01: "MEG",
  me02: "PFL",
  "me02.5": "ASC",
  me03: "POR",
  mep: "MEP",
  mee: "MEE",
};

function categoryParam(type) {
  if (type === "pokemon") return "Pokemon";
  if (type === "trainer") return "Trainer";
  if (type === "energy") return "Energy";
  return null;
}

function toDeckCategory(category) {
  const c = String(category || "").toLowerCase();
  if (c === "trainer") return "trainer";
  if (c === "energy") return "energy";
  return "pokemon";
}

function parseCardId(id) {
  const m = String(id || "").match(/^(.+)-([^-]+)$/);
  if (!m) return null;
  return { setId: m[1], localId: m[2] };
}

function seriesFromSetId(setId) {
  const s = String(setId || "");
  if (s.startsWith("me")) return "me";
  if (s.startsWith("sv")) return "sv";
  if (s.startsWith("swsh")) return "swsh";
  return s.match(/^[a-z]+/)?.[0] || "sv";
}

const PROMO_SETS = new Set(["MEP", "SVP", "MEE"]);

function padCardNumber(localId) {
  const digits = String(localId || "").replace(/\D/g, "");
  if (!digits) return String(localId || "");
  return digits.padStart(3, "0");
}

function buildLimitlessPromoImageUrl(setCode, localId) {
  const set = String(setCode || "")
    .trim()
    .toUpperCase();
  if (!PROMO_SETS.has(set)) return undefined;
  const n = padCardNumber(localId);
  if (!n) return undefined;
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${n}_R_EN_LG.png`;
}

/** Arte de ESTA impresión. Promos → Limitless. Nunca prestar otra carta. */
function buildImageUrl(card) {
  const parsed = parseCardId(card.id);
  const setId = card.set?.id || parsed?.setId;
  const localId = card.localId || parsed?.localId;
  if (!setId || !localId) return undefined;

  const limitlessSet = TCGDEX_TO_LIMITLESS[setId] || String(setId).toUpperCase();
  if (PROMO_SETS.has(String(limitlessSet).toUpperCase())) {
    const lim = buildLimitlessPromoImageUrl(limitlessSet, localId);
    if (lim) return lim;
  }

  const apiImg = card.image && String(card.image).trim();
  if (apiImg && apiImg.includes(`/${setId}/`)) return apiImg;

  return `https://assets.tcgdex.net/en/${seriesFromSetId(setId)}/${setId}/${localId}`;
}

function cardSetId(card) {
  return String(card.set?.id || parseCardId(card.id)?.setId || "").toLowerCase();
}

function isCurrentPromoSet(setId) {
  return setId === "mep" || setId === "mee";
}

function passesFormat(card, format) {
  if (format === "glc") return true;
  const cat = toDeckCategory(card.category);
  if (cat === "trainer" || cat === "energy") return true;

  const setId = cardSetId(card);
  const reg = String(card.regulationMark || "").trim().toUpperCase();

  if (format === "standard") {
    if (card.legal?.standard === true) return true;
    if (isCurrentPromoSet(setId) && (!reg || reg === "H" || reg === "I" || reg === "J")) return true;
    if (setId === "svp" && (reg === "H" || reg === "I" || reg === "J")) return true;
    return false;
  }

  if (card.legal?.expanded === true) return true;
  if (!card.legal) return true;
  return card.legal.expanded === true;
}

function briefPriority(card) {
  const id = String(card.id || "").toLowerCase();
  let score = 0;
  if (id.startsWith("mep-")) score += 50;
  if (id.startsWith("svp-") || id.startsWith("mee-")) score += 40;
  if (id.startsWith("me0") || id.startsWith("me")) score += 20;
  if (id.startsWith("sv")) score += 10;
  return score;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("TCGdex fetch failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toResult(card) {
  const parsed = parseCardId(card.id);
  const setId = card.set?.id || parsed?.setId;
  const number = card.localId || parsed?.localId;
  const setCode = setId ? TCGDEX_TO_LIMITLESS[setId] || String(setId).toUpperCase() : undefined;
  return {
    id: card.id,
    name: card.name,
    category: toDeckCategory(card.category),
    setCode,
    number,
    image: buildImageUrl(card),
  };
}

function scoreResult(card) {
  let score = 0;
  if (card.image) score += 4;
  if (card.setCode) score += 2;
  if (card.number) score += 1;
  const set = String(card.setCode || "").toUpperCase();
  if (set === "MEP") score += 8;
  if (set === "SVP" || set === "MEE") score += 5;
  if (set === "PFL" || set === "MEG" || set === "ASC" || set === "POR") score += 3;
  return score;
}

/**
 * @param {{ query: string, type?: string, format?: string }} options
 */
export async function searchTcgdexCards(options) {
  const q = String(options.query || "").trim();
  if (q.length < 1) return [];

  const type = options.type || "all";
  const format = options.format || "standard";

  const url = new URL(`${TCGDEX_BASE}/cards`);
  url.searchParams.set("name", q);
  const cat = categoryParam(type);
  if (cat) url.searchParams.set("category", cat);

  const briefs = await fetchJson(url.toString());
  if (!Array.isArray(briefs) || !briefs.length) return [];

  const qLower = q.toLowerCase();
  const matched = briefs.filter((b) => String(b.name || "").toLowerCase().includes(qLower));
  const pool = matched.length ? matched : briefs;

  const candidates = [...pool]
    .sort((a, b) => briefPriority(b) - briefPriority(a))
    .slice(0, BRIEF_CANDIDATES);

  /** @type {any[]} */
  const accepted = [];
  for (let i = 0; i < candidates.length && accepted.length < MAX_RESULTS; i += FETCH_BATCH) {
    const batch = candidates.slice(i, i + FETCH_BATCH);
    const fullCards = await Promise.all(
      batch.map((b) => fetchJson(`${TCGDEX_BASE}/cards/${b.id}`))
    );
    for (const card of fullCards) {
      if (!card || !passesFormat(card, format)) continue;
      accepted.push(card);
      if (accepted.length >= MAX_RESULTS) break;
    }
  }

  const seen = new Map();
  const results = accepted.map(toResult).sort((a, b) => scoreResult(b) - scoreResult(a));

  for (const card of results) {
    const key = `${card.name}|${card.setCode || ""}|${card.number || ""}`.toLowerCase();
    const prev = seen.get(key);
    if (!prev || (!prev.image && card.image)) seen.set(key, card);
  }

  return [...seen.values()].slice(0, MAX_RESULTS);
}
