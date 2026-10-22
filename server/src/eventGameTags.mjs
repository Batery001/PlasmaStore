export const EVENT_GAME_TAGS = [
  { slug: "mitos-y-leyendas", name: "Mitos y Leyendas" },
  { slug: "pokemon", name: "Pokémon" },
];

export function normalizeEventGameTag(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return "";
  if (s === "pokemon" || s === "poke") return "pokemon";
  if (s.includes("mito") || s === "myl" || s === "my-l") return "mitos-y-leyendas";
  return "";
}

export function eventGameTagLabel(slug) {
  const n = normalizeEventGameTag(slug);
  return EVENT_GAME_TAGS.find((t) => t.slug === n)?.name || "";
}
