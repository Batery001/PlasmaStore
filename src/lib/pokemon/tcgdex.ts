import type { DeckCardCategory } from "./deckParser";
import { limitlessSetToTcgdex } from "./limitless-set-codes";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const FETCH_TIMEOUT_MS = 8_000;

type TcgdexCard = {
  category?: string;
  name?: string;
  localId?: string;
  regulationMark?: string;
  set?: { id?: string };
};

type TcgdexCardBrief = {
  id: string;
  name: string;
  localId: string;
};

const categoryCache = new Map<string, CardLookup>();

export type CardLookup = {
  category: DeckCardCategory | null;
  regulationMark: string | null;
};

function cacheKey(setCode: string, number: string, name: string): string {
  return `${setCode.toUpperCase()}|${number}|${name.trim().toLowerCase()}`;
}

function numberVariants(number: string): string[] {
  const trimmed = number.trim();
  const variants = new Set<string>([trimmed]);
  const unpadded = trimmed.replace(/^0+/, "") || "0";
  variants.add(unpadded);
  variants.add(unpadded.padStart(3, "0"));
  return [...variants];
}

function tcgdxCategoryToDeck(category?: string): DeckCardCategory | null {
  if (!category) return null;
  const c = category.toLowerCase();
  if (c === "pokemon" || c === "pokémon") return "pokemon";
  if (c === "trainer") return "trainer";
  if (c === "energy") return "energy";
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

function localIdsMatch(a: string, b: string): boolean {
  const na = a.replace(/^0+/, "") || "0";
  const nb = b.replace(/^0+/, "") || "0";
  return na === nb;
}

function pickBestMatch(
  results: TcgdexCardBrief[],
  tcgdexSetId: string,
  number: string,
  name: string
): TcgdexCardBrief | null {
  const normalizedName = name.trim().toLowerCase();
  const bySetAndNumber = results.filter(
    (r) =>
      r.id.startsWith(`${tcgdexSetId}-`) &&
      numberVariants(number).some((v) => localIdsMatch(r.localId, v))
  );
  if (bySetAndNumber.length === 1) return bySetAndNumber[0];
  const byName = bySetAndNumber.filter(
    (r) => r.name.trim().toLowerCase() === normalizedName
  );
  if (byName.length >= 1) return byName[0];
  if (bySetAndNumber.length > 0) return bySetAndNumber[0];

  const byNameOnly = results.filter(
    (r) => r.name.trim().toLowerCase() === normalizedName
  );
  if (byNameOnly.length === 1) return byNameOnly[0];
  return null;
}

/**
 * Resuelve categoría y marca de regulación con TCGdex.
 */
export async function lookupCardMeta(
  setCode: string,
  number: string,
  name: string
): Promise<CardLookup> {
  const key = cacheKey(setCode, number, name);
  const cached = categoryCache.get(key);
  if (cached) return cached;

  const tcgdexSetId = limitlessSetToTcgdex(setCode);
  let resolved: CardLookup = { category: null, regulationMark: null };

  if (tcgdexSetId) {
    for (const num of numberVariants(number)) {
      const direct = await fetchJson<TcgdexCard>(
        `${TCGDEX_BASE}/cards/${tcgdexSetId}-${num}`
      );
      if (direct?.category || direct?.regulationMark) {
        resolved = {
          category: tcgdxCategoryToDeck(direct.category),
          regulationMark: direct.regulationMark?.trim().toUpperCase() || null,
        };
        if (resolved.category) break;
      }
    }
  }

  if (!resolved.category) {
    const searchUrl = `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name.trim())}`;
    const results = await fetchJson<TcgdexCardBrief[]>(searchUrl);
    if (results?.length) {
      const match =
        tcgdexSetId != null
          ? pickBestMatch(results, tcgdexSetId, number, name)
          : results.find(
              (r) => r.name.trim().toLowerCase() === name.trim().toLowerCase()
            ) ?? null;

      if (match) {
        const full = await fetchJson<TcgdexCard>(
          `${TCGDEX_BASE}/cards/${match.id}`
        );
        resolved = {
          category: tcgdxCategoryToDeck(full?.category) ?? resolved.category,
          regulationMark:
            full?.regulationMark?.trim().toUpperCase() ||
            resolved.regulationMark,
        };
      }
    }
  }

  categoryCache.set(key, resolved);
  return resolved;
}

export async function lookupCardCategory(
  setCode: string,
  number: string,
  name: string
): Promise<DeckCardCategory | null> {
  const meta = await lookupCardMeta(setCode, number, name);
  return meta.category;
}

/** Limpia caché (útil en tests). */
export function clearTcgdexCategoryCache(): void {
  categoryCache.clear();
}
