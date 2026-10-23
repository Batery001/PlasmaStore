import { parseTcgdexCardId, tcgdexSetToLimitless } from "./limitless-set-codes";

type ImageSource = {
  id: string;
  name: string;
  image?: string;
  localId?: string;
  set?: { id?: string };
};

const PROMO_SETS = new Set(["MEP", "SVP", "MEE"]);

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

function padCardNumber(localId: string): string {
  const digits = String(localId || "").replace(/\D/g, "");
  if (!digits) return String(localId || "");
  return digits.padStart(3, "0");
}

/** Escaneos reales de promo en Limitless (MEP/SVP/MEE). */
export function buildLimitlessPromoImageUrl(
  setCode: string,
  localId: string
): string | undefined {
  const set = String(setCode || "")
    .trim()
    .toUpperCase();
  if (!PROMO_SETS.has(set)) return undefined;
  const n = padCardNumber(localId);
  if (!n) return undefined;
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${n}_R_EN_LG.png`;
}

/** URL base TCGdex de ESTA impresión (nunca otra carta). */
export function buildTcgdexImageUrl(card: ImageSource): string | undefined {
  const setId = card.set?.id ?? parseTcgdexCardId(card.id)?.tcgdexSetId;
  const localId = card.localId ?? parseTcgdexCardId(card.id)?.localId;
  if (!setId || !localId) return undefined;

  const series = tcgdexSeriesFromSetId(setId);
  return `https://assets.tcgdex.net/en/${series}/${setId}/${localId}`;
}

/**
 * Imagen de la impresión correcta.
 * Promos: Limitless primero (arte real). Nunca prestar arte de otra carta del mismo nombre.
 */
export function resolveCardImageUrl(card: ImageSource): string | undefined {
  const setId = card.set?.id ?? parseTcgdexCardId(card.id)?.tcgdexSetId;
  const localId = card.localId ?? parseTcgdexCardId(card.id)?.localId;
  const limitlessSet = setId ? tcgdexSetToLimitless(setId) : null;

  if (limitlessSet && localId && PROMO_SETS.has(limitlessSet.toUpperCase())) {
    const lim = buildLimitlessPromoImageUrl(limitlessSet, localId);
    if (lim) return lim;
  }

  // Solo aceptar image de la API si apunta a ESTA carta (mismo set en la URL).
  const apiImg = card.image?.trim();
  if (apiImg && setId && apiImg.includes(`/${setId}/`)) return apiImg;

  return buildTcgdexImageUrl(card);
}

/** @deprecated usar resolveCardImageUrl — no prestar arte de peers. */
export function enrichCardImage<T extends ImageSource>(card: T, _peers?: T[]): T & { image?: string } {
  const image = resolveCardImageUrl(card);
  return image ? { ...card, image } : card;
}

/** Variantes de URL para probar si la primera no carga. */
export function tcgdxImageVariants(baseUrl?: string): string[] {
  if (!baseUrl?.trim()) return [];
  const url = baseUrl.trim();

  // Limitless promo scans
  if (url.includes("limitlesstcg") || url.includes("digitaloceanspaces.com/tpci/")) {
    if (/_EN_LG\.png$/i.test(url)) {
      return [url, url.replace(/_EN_LG\.png$/i, "_EN.png")];
    }
    if (/_EN\.png$/i.test(url)) {
      return [url, url.replace(/_EN\.png$/i, "_EN_LG.png")];
    }
    return [url];
  }

  // Pokémon TCG API / Scrydex CDN
  if (url.includes("images.pokemontcg.io") || url.includes("images.scrydex.com")) {
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
    return [`${base}/low.webp`, `${base}/high.webp`];
  }

  return [url];
}
