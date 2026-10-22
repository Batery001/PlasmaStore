// src/lib/pokemon/pokemontcg-search.ts
var POKEMONTCG_BASE = "https://api.pokemontcg.io/v2";
var FETCH_TIMEOUT_MS = 12e3;
var MAX_RESULTS = 36;
function supertypeToCategory(supertype) {
  const s = (supertype ?? "").toLowerCase();
  if (s === "trainer") return "trainer";
  if (s === "energy") return "energy";
  return "pokemon";
}
function escapeLucene(value) {
  return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}
function buildQuery(rawQuery, type, format) {
  const q = escapeLucene(rawQuery.trim());
  const namePart = q.includes(" ") ? `name:"${q}*"` : `name:${q}*`;
  const parts = [namePart];
  if (type === "pokemon") {
    parts.push("(supertype:Pok\xE9mon)");
    if (format === "standard") parts.push("(legalities.standard:Legal)");
    if (format === "expanded") parts.push("(legalities.expanded:Legal)");
  } else if (type === "trainer") {
    parts.push("(supertype:Trainer)");
  } else if (type === "energy") {
    parts.push("(supertype:Energy)");
  } else if (format === "standard") {
    parts.push(
      "((supertype:Pok\xE9mon AND legalities.standard:Legal) OR (supertype:Trainer) OR (supertype:Energy))"
    );
  } else if (format === "expanded") {
    parts.push(
      "((supertype:Pok\xE9mon AND legalities.expanded:Legal) OR (supertype:Trainer) OR (supertype:Energy))"
    );
  }
  return parts.join(" ");
}
function cardToResult(card) {
  return {
    id: card.id,
    name: card.name,
    category: supertypeToCategory(card.supertype),
    setCode: card.set?.ptcgoCode?.trim() || void 0,
    number: card.number?.trim() || void 0,
    image: card.images?.small || card.images?.large || void 0
  };
}
function passesClientFormat(card, format) {
  if (format === "glc") return true;
  const category = supertypeToCategory(card.supertype);
  if (category === "trainer" || category === "energy") return true;
  if (format === "standard") {
    return (card.legalities?.standard ?? "").toLowerCase() === "legal";
  }
  return (card.legalities?.expanded ?? "").toLowerCase() === "legal";
}
async function fetchCards(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { Accept: "application/json" };
  const apiKey = process.env.POKEMONTCG_API_KEY?.trim();
  if (apiKey) headers["X-Api-Key"] = apiKey;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers
    });
    if (!res.ok) {
      console.error("Pok\xE9mon TCG API error:", res.status, await res.text());
      return [];
    }
    const body = await res.json();
    return body.data ?? [];
  } catch (err) {
    console.error("Pok\xE9mon TCG API fetch failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
async function searchPokemontcgCards(options) {
  const q = options.query.trim();
  if (q.length < 1) return [];
  const type = options.type ?? "all";
  const format = options.format ?? "standard";
  const lucene = buildQuery(q, type, format);
  const url = new URL(`${POKEMONTCG_BASE}/cards`);
  url.searchParams.set("q", lucene);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", String(MAX_RESULTS));
  url.searchParams.set("orderBy", "-set.releaseDate");
  const cards = await fetchCards(url.toString());
  const filtered = cards.filter((c) => passesClientFormat(c, format));
  const results = filtered.map(cardToResult).sort((a, b) => scoreResult(b) - scoreResult(a));
  return dedupePreferImage(results).slice(0, 24);
}
function scoreResult(card) {
  let score = 0;
  if (card.image) score += 5;
  if (card.setCode) score += 2;
  if (card.number) score += 1;
  return score;
}
function dedupePreferImage(cards) {
  const seen = /* @__PURE__ */ new Map();
  for (const card of cards) {
    const key = `${card.name}|${card.setCode ?? ""}|${card.number ?? ""}`.toLowerCase();
    const prev = seen.get(key);
    if (!prev || !prev.image && card.image) seen.set(key, card);
  }
  return [...seen.values()];
}
export {
  searchPokemontcgCards
};
