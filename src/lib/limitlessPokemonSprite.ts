/** CDN Gen 9 de Limitless (PNG por slug, alineado con nombres tipo PokéAPI). */
export const LIMITLESS_POKEMON_SPRITE_BASE = "https://r2.limitlesstcg.net/pokemon/gen9";

export function normalizePokemonSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function isHttpUrl(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.startsWith("http://") || t.startsWith("https://");
}

export function getLimitlessPokemonSpriteUrl(slug: string): string {
  const s = normalizePokemonSlug(slug);
  if (!s) return "";
  return `${LIMITLESS_POKEMON_SPRITE_BASE}/${s}.png`;
}

/** Si es URL absoluta se devuelve tal cual; si no, se asume slug Limitless. */
export function resolveDeckSpriteSrc(srcOrSlug: string): string {
  const t = srcOrSlug.trim();
  if (!t) return "";
  if (isHttpUrl(t)) return t;
  return getLimitlessPokemonSpriteUrl(t);
}

/** Iconos de menú/caja PokeAPI o sprites Limitless: conviene `image-rendering: pixelated`. */
export function shouldUsePixelatedSpriteRendering(resolvedUrl: string): boolean {
  const u = resolvedUrl.trim().toLowerCase();
  if (!u.startsWith("http")) return false;
  if (u.includes("r2.limitlesstcg.net/pokemon")) return true;
  if (!u.includes("raw.githubusercontent.com/pokeapi/sprites")) return false;
  return (
    u.includes("/versions/generation-viii/icons/") ||
    u.includes("/versions/generation-ix/scarlet-violet/") ||
    u.includes("/versions/generation-vii/icons/")
  );
}
