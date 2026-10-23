import type { DeckCardCategory } from "./deckParser";
import type { CardSearchResult, DeckFormat, DeckTypeFilter } from "./deck-builder";
import { enrichCardImage, buildTcgdexImageUrl } from "./tcgdex-image";
import { parseTcgdexCardId, tcgdexSetToLimitless } from "./limitless-set-codes";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const FETCH_TIMEOUT_MS = 10_000;
/** Cuántos candidatos de la API miramos antes de filtrar por formato. */
const BRIEF_CANDIDATES = 120;
const FETCH_BATCH = 24;
const MAX_RESULTS = 28;

type TcgdexBrief = {
  id: string;
  name: string;
  localId?: string;
  image?: string;
};

type TcgdexFull = TcgdexBrief & {
  category?: string;
  legal?: { standard?: boolean; expanded?: boolean };
  set?: { id?: string };
  regulationMark?: string;
};

function tcgdxCategoryToDeck(category?: string): DeckCardCategory {
  const c = (category ?? "").toLowerCase();
  if (c === "trainer") return "trainer";
  if (c === "energy") return "energy";
  return "pokemon";
}

function categoryParam(filter: DeckTypeFilter): string | null {
  if (filter === "pokemon") return "Pokemon";
  if (filter === "trainer") return "Trainer";
  if (filter === "energy") return "Energy";
  return null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Standard: solo Pokémon en rotación (`legal.standard`).
 * Entrenadores y energías: todas las impresiones (regla de reimpresión).
 */
function passesFormat(card: TcgdexFull, format: DeckFormat): boolean {
  if (format === "glc") return true;

  const category = tcgdxCategoryToDeck(card.category);
  if (category === "trainer" || category === "energy") return true;

  // Sin dato de legalidad: no inventar Standard (sí dejamos Expanded/GLC vía otros caminos).
  if (!card.legal) return format !== "standard";
  if (format === "standard") return card.legal.standard === true;
  return card.legal.expanded === true;
}

function briefToResult(card: TcgdexFull): CardSearchResult {
  const parsed = parseTcgdexCardId(card.id);
  const tcgdexSetId = card.set?.id ?? parsed?.tcgdexSetId;
  const number = card.localId ?? parsed?.localId;
  const setCode = tcgdexSetId ? tcgdexSetToLimitless(tcgdexSetId) ?? tcgdexSetId.toUpperCase() : undefined;
  const image = buildTcgdexImageUrl(card);

  return {
    id: card.id,
    name: card.name,
    category: tcgdxCategoryToDeck(card.category),
    setCode,
    number,
    image,
  };
}

/** Prioriza promo MEP/SVP y sets recientes para que no queden tapados. */
function prioritizeBriefs(briefs: TcgdexBrief[]): TcgdexBrief[] {
  return [...briefs].sort((a, b) => briefPriority(b) - briefPriority(a));
}

function briefPriority(card: TcgdexBrief): number {
  const id = card.id.toLowerCase();
  let score = 0;
  if (id.startsWith("mep-")) score += 50;
  if (id.startsWith("svp-") || id.startsWith("mee-")) score += 40;
  if (id.startsWith("me0") || id.startsWith("me")) score += 20;
  if (id.startsWith("sv")) score += 10;
  return score;
}

export async function searchTcgdexCards(options: {
  query: string;
  type?: DeckTypeFilter;
  format?: DeckFormat;
}): Promise<CardSearchResult[]> {
  const q = options.query.trim();
  if (q.length < 1) return [];

  const url = new URL(`${TCGDEX_BASE}/cards`);
  url.searchParams.set("name", q);
  const cat = categoryParam(options.type ?? "all");
  if (cat) url.searchParams.set("category", cat);

  const briefs = await fetchJson<TcgdexBrief[]>(url.toString());
  if (!briefs?.length) return [];

  const format = options.format ?? "standard";
  const candidates = prioritizeBriefs(briefs).slice(0, BRIEF_CANDIDATES);
  const accepted: TcgdexFull[] = [];

  for (let i = 0; i < candidates.length && accepted.length < MAX_RESULTS; i += FETCH_BATCH) {
    const batch = candidates.slice(i, i + FETCH_BATCH);
    const fullCards = await Promise.all(
      batch.map((b) => fetchJson<TcgdexFull>(`${TCGDEX_BASE}/cards/${b.id}`))
    );
    for (const card of fullCards) {
      if (!card || !passesFormat(card, format)) continue;
      accepted.push(card);
      if (accepted.length >= MAX_RESULTS) break;
    }
  }

  if (accepted.length === 0) return [];

  const enriched = accepted.map((c) => enrichCardImage(c, accepted));

  const results = enriched
    .map(briefToResult)
    .sort((a, b) => scoreResult(b) - scoreResult(a));

  // Una fila por impresión (set+número). No ocultar promos sin arte si hay otra con imagen.
  return dedupeByPrinting(results).slice(0, MAX_RESULTS);
}

function scoreResult(card: CardSearchResult): number {
  let score = 0;
  if (card.image) score += 4;
  if (card.setCode) score += 2;
  if (card.number) score += 1;
  const set = (card.setCode || "").toUpperCase();
  if (set === "MEP") score += 8;
  if (set === "SVP" || set === "MEE") score += 5;
  if (set === "PFL" || set === "MEG" || set === "ASC" || set === "POR") score += 3;
  return score;
}

function dedupeByPrinting(cards: CardSearchResult[]): CardSearchResult[] {
  const seen = new Map<string, CardSearchResult>();
  for (const card of cards) {
    const key = `${card.name}|${card.setCode ?? ""}|${card.number ?? ""}`.toLowerCase();
    const prev = seen.get(key);
    if (!prev || (!prev.image && card.image)) seen.set(key, card);
  }
  return [...seen.values()];
}
