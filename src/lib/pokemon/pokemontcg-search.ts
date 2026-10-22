import type { DeckCardCategory } from "./deckParser";
import type {
  CardSearchResult,
  DeckFormat,
  DeckTypeFilter,
} from "./deck-builder";

const POKEMONTCG_BASE = "https://api.pokemontcg.io/v2";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 36;

type PokemonTcgCard = {
  id: string;
  name: string;
  number?: string;
  supertype?: string;
  regulationMark?: string;
  legalities?: {
    standard?: string;
    expanded?: string;
    unlimited?: string;
  };
  images?: {
    small?: string;
    large?: string;
  };
  set?: {
    id?: string;
    ptcgoCode?: string;
    name?: string;
  };
};

type PokemonTcgSearchResponse = {
  data?: PokemonTcgCard[];
  count?: number;
  totalCount?: number;
};

function supertypeToCategory(supertype?: string): DeckCardCategory {
  const s = (supertype ?? "").toLowerCase();
  if (s === "trainer") return "trainer";
  if (s === "energy") return "energy";
  return "pokemon";
}

function escapeLucene(value: string): string {
  return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}

function buildQuery(
  rawQuery: string,
  type: DeckTypeFilter,
  format: DeckFormat
): string {
  const q = escapeLucene(rawQuery.trim());
  // Wildcard para coincidir Switch / Energy Switch al escribir "swit"
  const namePart = q.includes(" ") ? `name:"${q}*"` : `name:${q}*`;

  const parts: string[] = [namePart];

  if (type === "pokemon") {
    parts.push("(supertype:Pokémon)");
    if (format === "standard") parts.push("(legalities.standard:Legal)");
    if (format === "expanded") parts.push("(legalities.expanded:Legal)");
  } else if (type === "trainer") {
    parts.push("(supertype:Trainer)");
  } else if (type === "energy") {
    parts.push("(supertype:Energy)");
  } else if (format === "standard") {
    // Pokémon solo en rotación; entrenadores y energías: todas las impresiones
    parts.push(
      "((supertype:Pokémon AND legalities.standard:Legal) OR (supertype:Trainer) OR (supertype:Energy))"
    );
  } else if (format === "expanded") {
    parts.push(
      "((supertype:Pokémon AND legalities.expanded:Legal) OR (supertype:Trainer) OR (supertype:Energy))"
    );
  }

  return parts.join(" ");
}

function cardToResult(card: PokemonTcgCard): CardSearchResult {
  return {
    id: card.id,
    name: card.name,
    category: supertypeToCategory(card.supertype),
    setCode: card.set?.ptcgoCode?.trim() || undefined,
    number: card.number?.trim() || undefined,
    image: card.images?.small || card.images?.large || undefined,
  };
}

function passesClientFormat(
  card: PokemonTcgCard,
  format: DeckFormat
): boolean {
  if (format === "glc") return true;
  const category = supertypeToCategory(card.supertype);
  if (category === "trainer" || category === "energy") return true;
  if (format === "standard") {
    return (card.legalities?.standard ?? "").toLowerCase() === "legal";
  }
  return (card.legalities?.expanded ?? "").toLowerCase() === "legal";
}

async function fetchCards(url: string): Promise<PokemonTcgCard[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.POKEMONTCG_API_KEY?.trim();
  if (apiKey) headers["X-Api-Key"] = apiKey;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) {
      console.error("Pokémon TCG API error:", res.status, await res.text());
      return [];
    }
    const body = (await res.json()) as PokemonTcgSearchResponse;
    return body.data ?? [];
  } catch (err) {
    console.error("Pokémon TCG API fetch failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPokemontcgCards(options: {
  query: string;
  type?: DeckTypeFilter;
  format?: DeckFormat;
}): Promise<CardSearchResult[]> {
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

  const results = filtered
    .map(cardToResult)
    .sort((a, b) => scoreResult(b) - scoreResult(a));

  return dedupePreferImage(results).slice(0, 24);
}

function scoreResult(card: CardSearchResult): number {
  let score = 0;
  if (card.image) score += 5;
  if (card.setCode) score += 2;
  if (card.number) score += 1;
  return score;
}

function dedupePreferImage(cards: CardSearchResult[]): CardSearchResult[] {
  const seen = new Map<string, CardSearchResult>();
  for (const card of cards) {
    const key = `${card.name}|${card.setCode ?? ""}|${card.number ?? ""}`.toLowerCase();
    const prev = seen.get(key);
    if (!prev || (!prev.image && card.image)) seen.set(key, card);
  }
  return [...seen.values()];
}
