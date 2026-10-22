import { parseTcgdexCardId } from "./limitless-set-codes";

type ImageSource = {
  id: string;
  name: string;
  image?: string;
  localId?: string;
  set?: { id?: string };
};

export function tcgdexSeriesFromSetId(setId: string): string {
  if (setId.startsWith("me")) return "me";
  if (setId.startsWith("sv")) return "sv";
  if (setId.startsWith("swsh")) return "swsh";
  if (setId.startsWith("sm")) return "sm";
  if (setId.startsWith("xy")) return "xy";
  if (setId.startsWith("base")) return "base";
  if (setId.startsWith("hgss")) return "hgss";
  return setId.match(/^[a-z]+/)?.[0] ?? "sv";
}

/** Construye URL base de imagen cuando la API no incluye el campo `image`. */
export function buildTcgdexImageUrl(card: ImageSource): string | undefined {
  if (card.image?.trim()) return card.image.trim();

  const setId = card.set?.id ?? parseTcgdexCardId(card.id)?.tcgdexSetId;
  const localId = card.localId ?? parseTcgdexCardId(card.id)?.localId;
  if (!setId || !localId) return undefined;

  const series = tcgdexSeriesFromSetId(setId);
  return `https://assets.tcgdex.net/en/${series}/${setId}/${localId}`;
}

export function resolveImageFromPeers(
  name: string,
  peers: ImageSource[]
): string | undefined {
  const normalized = name.trim().toLowerCase();
  for (const peer of peers) {
    if (peer.name.trim().toLowerCase() !== normalized) continue;
    const url = buildTcgdexImageUrl(peer);
    if (url) return url;
  }
  return undefined;
}

export function enrichCardImage<T extends ImageSource>(
  card: T,
  peers: T[]
): T & { image?: string } {
  const built = buildTcgdexImageUrl(card);
  if (built) return { ...card, image: built };
  const fallback = resolveImageFromPeers(card.name, peers);
  if (fallback) return { ...card, image: fallback };
  return card;
}

/** Variantes de URL para probar si la primera no carga. */
export function tcgdxImageVariants(baseUrl?: string): string[] {
  if (!baseUrl?.trim()) return [];
  const url = baseUrl.trim();

  // Pokémon TCG API / Scrydex CDN
  if (
    url.includes("images.pokemontcg.io") ||
    url.includes("images.scrydex.com")
  ) {
    if (url.includes("_hires")) {
      return [url, url.replace("_hires", "")];
    }
    if (/\/small\/?$/i.test(url) || url.endsWith("/small")) {
      return [url, url.replace(/\/small\/?$/i, "/large")];
    }
    if (/\/large\/?$/i.test(url) || url.endsWith("/large")) {
      return [url, url.replace(/\/large\/?$/i, "/small")];
    }
    if (/\.png$/i.test(url) && !url.includes("_hires")) {
      return [url, url.replace(/\.png$/i, "_hires.png")];
    }
    return [url];
  }

  // TCGdex assets
  if (url.includes("assets.tcgdex.net") || /\.webp/i.test(url)) {
    const base = url.replace(/\/low\.webp$|\/high\.webp$|\.webp$/i, "");
    return [`${base}/low.webp`, `${base}/high.webp`, base];
  }

  return [url];
}

