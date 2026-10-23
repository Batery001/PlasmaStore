export const POKEMON_FORMATS = [
  { slug: "casual", name: "Casual" },
  { slug: "challenge", name: "Challenge" },
  { slug: "cup", name: "Cup" },
] as const;

export type PokemonFormat = (typeof POKEMON_FORMATS)[number]["slug"];

export function normalizePokemonFormat(raw: unknown): PokemonFormat | "" {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return "";
  if (s.includes("chall")) return "challenge";
  if (s === "cup" || s.includes("copa")) return "cup";
  if (s.includes("casual") || s.includes("fun") || s.includes("liga") || s === "play") return "casual";
  return "";
}

export function pokemonFormatLabel(slug: unknown) {
  const n = normalizePokemonFormat(slug);
  return POKEMON_FORMATS.find((t) => t.slug === n)?.name || "";
}

export function eventNeedsDecklist(event: { game_tag?: string | null; pokemon_format?: string | null } | null | undefined) {
  const tag = String(event?.game_tag || "")
    .trim()
    .toLowerCase();
  if (tag !== "pokemon") return false;
  const f = normalizePokemonFormat(event?.pokemon_format);
  return f === "challenge" || f === "cup";
}

export const MYL_ERAS = [
  { slug: "primera-era", name: "Primera Era" },
  { slug: "primer-bloque", name: "Primer Bloque" },
] as const;

export const MYL_EVENT_TYPES = [
  { slug: "liga", name: "Liga" },
  { slug: "avanzado", name: "Avanzado" },
  { slug: "ocasional", name: "Casual" },
  { slug: "premier", name: "Premier" },
] as const;

export const MYL_DECK_FORMATS = [
  {
    slug: "racial",
    name: "Racial soporte edición",
    hint: "Aliados de una raza; Armas/Tótems/Talismanes/Oros solo de la edición hogar. Mín. 16 Aliados.",
  },
  {
    slug: "soporte-libre",
    name: "Racial soporte libre",
    hint: "Aliados de una raza; soporte de cualquier edición del formato. Mín. 16 Aliados.",
  },
  {
    slug: "libre",
    name: "Libre / Full",
    hint: "Podés mezclar razas y soporte de todo el formato (50 cartas, máx. 3 copias).",
  },
] as const;

export const MYL_RACES_PRIMERA_ERA = [
  { slug: "abominacion", name: "Abominación" },
  { slug: "barbaro", name: "Bárbaro" },
  { slug: "bestia", name: "Bestia" },
  { slug: "caballero", name: "Caballero" },
  { slug: "campeon", name: "Campeón" },
  { slug: "cazador", name: "Cazador" },
  { slug: "chaman", name: "Chamán" },
  { slug: "criaturas", name: "Criaturas" },
  { slug: "dios", name: "Dios" },
  { slug: "dragon", name: "Dragón" },
  { slug: "faerie", name: "Faerie" },
  { slug: "guerrero", name: "Guerrero" },
  { slug: "kami", name: "Kami" },
  { slug: "licantropo", name: "Licántropo" },
  { slug: "vampiro", name: "Vampiro" },
  { slug: "xian", name: "Xian" },
] as const;

export const MYL_RACES_PRIMER_BLOQUE = [
  { slug: "caballero", name: "Caballero" },
  { slug: "defensor", name: "Defensor" },
  { slug: "desafiante", name: "Desafiante" },
  { slug: "dragon", name: "Dragón" },
  { slug: "druida", name: "Druida (Defensor)" },
  { slug: "eterno", name: "Eterno" },
  { slug: "faerie", name: "Faerie" },
  { slug: "faraon", name: "Faraón" },
  { slug: "goblin", name: "Goblin (Faerie)" },
  { slug: "heroe", name: "Héroe" },
  { slug: "minotauro", name: "Minotauro (Titán)" },
  { slug: "olimpico", name: "Olímpico" },
  { slug: "sacerdote", name: "Sacerdote" },
  { slug: "sombra", name: "Sombra" },
  { slug: "titan", name: "Titán" },
] as const;

function fold(raw: unknown) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeMylEra(raw: unknown) {
  const s = fold(raw);
  if (!s) return "";
  if (s.includes("primer") && s.includes("bloque")) return "primer-bloque";
  if (s.includes("primera") || s === "pe" || s === "primera-era") return "primera-era";
  if (s === "pb" || s === "pbx" || s === "primer-bloque") return "primer-bloque";
  return MYL_ERAS.some((x) => x.slug === s) ? s : "";
}

export function normalizeMylEventType(raw: unknown) {
  const s = fold(raw);
  if (!s) return "";
  if (s.includes("avanz")) return "avanzado";
  if (s.includes("ocasion") || s.includes("casual")) return "ocasional";
  if (s.includes("prem")) return "premier";
  if (s.includes("liga")) return "liga";
  return MYL_EVENT_TYPES.some((x) => x.slug === s) ? s : "";
}

export function normalizeMylDeckFormat(raw: unknown) {
  const s = fold(raw);
  if (!s) return "";
  // Orden: soporte-libre antes que libre (porque "soporte-libre" contiene "libre")
  if (
    s === "soporte-libre" ||
    s === "racial-soporte-libre" ||
    (s.includes("soporte") && s.includes("libre"))
  ) {
    return "soporte-libre";
  }
  if (s === "libre" || s === "full" || s.includes("full") || s.includes("mixto")) return "libre";
  if (s === "racial" || s.includes("edicion") || s.includes("racial")) return "racial";
  return MYL_DECK_FORMATS.some((x) => x.slug === s) ? s : "";
}

export function mylRacesForEra(era: unknown) {
  const n = normalizeMylEra(era);
  if (n === "primer-bloque") return [...MYL_RACES_PRIMER_BLOQUE];
  if (n === "primera-era") return [...MYL_RACES_PRIMERA_ERA];
  const seen = new Set<string>();
  const out: Array<{ slug: string; name: string }> = [];
  for (const r of [...MYL_RACES_PRIMERA_ERA, ...MYL_RACES_PRIMER_BLOQUE]) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push(r);
  }
  return out;
}

export function normalizeMylRace(raw: unknown, era?: unknown) {
  const s = fold(raw);
  if (!s) return "";
  const hit = mylRacesForEra(era).find((r) => r.slug === s || fold(r.name) === s);
  return hit ? hit.slug : "";
}

export function mylEraLabel(slug: unknown) {
  const n = normalizeMylEra(slug);
  return MYL_ERAS.find((t) => t.slug === n)?.name || "";
}

export function mylEventTypeLabel(slug: unknown) {
  const n = normalizeMylEventType(slug);
  return MYL_EVENT_TYPES.find((t) => t.slug === n)?.name || "";
}

export function mylDeckFormatLabel(slug: unknown) {
  const n = normalizeMylDeckFormat(slug);
  return MYL_DECK_FORMATS.find((t) => t.slug === n)?.name || "";
}

export function mylRaceLabel(slug: unknown, era?: unknown) {
  const n = normalizeMylRace(slug, era);
  return mylRacesForEra(era).find((t) => t.slug === n)?.name || "";
}

export function mylEventSummary(event: {
  myl_era?: string | null;
  myl_event_type?: string | null;
  myl_deck_format?: string | null;
} | null | undefined) {
  return [mylEraLabel(event?.myl_era), mylEventTypeLabel(event?.myl_event_type), mylDeckFormatLabel(event?.myl_deck_format)]
    .filter(Boolean)
    .join(" · ");
}
