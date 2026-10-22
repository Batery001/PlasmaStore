import { normalizeEventGameTag } from "./eventGameTags.mjs";

export const POKEMON_FORMATS = [
  { slug: "casual", name: "Casual" },
  { slug: "challenge", name: "Challenge" },
  { slug: "cup", name: "Cup" },
];

export const DEFAULT_PLAYER_FORM_HOURS = 24;
export const DEFAULT_EVENT_MIN_AGE = 13;

export function normalizePokemonFormat(raw) {
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

export function pokemonFormatLabel(slug) {
  const n = normalizePokemonFormat(slug);
  return POKEMON_FORMATS.find((t) => t.slug === n)?.name || "";
}

export function eventNeedsDecklist(event) {
  if (normalizeEventGameTag(event?.game_tag) !== "pokemon") return false;
  const f = normalizePokemonFormat(event?.pokemon_format);
  return f === "challenge" || f === "cup";
}

export function playerFormHours(event) {
  const n = parseInt(String(event?.player_form_hours ?? DEFAULT_PLAYER_FORM_HOURS), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PLAYER_FORM_HOURS;
  return Math.min(168, n);
}

export function eventMinAge(event) {
  const n = parseInt(String(event?.min_age ?? DEFAULT_EVENT_MIN_AGE), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_EVENT_MIN_AGE;
  return Math.min(21, n);
}

export const MYL_ERAS = [
  { slug: "primera-era", name: "Primera Era" },
  { slug: "primer-bloque", name: "Primer Bloque" },
];

export const MYL_EVENT_TYPES = [
  { slug: "liga", name: "Liga" },
  { slug: "avanzado", name: "Avanzado" },
  { slug: "ocasional", name: "Casual" },
  { slug: "premier", name: "Premier" },
];

export const MYL_DECK_FORMATS = [
  { slug: "racial", name: "Racial" },
  { slug: "soporte-libre", name: "Racial soporte libre" },
  { slug: "libre", name: "Libre / Full" },
];

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
];

export const MYL_RACES_PRIMER_BLOQUE = [
  { slug: "caballero", name: "Caballero" },
  { slug: "defensor", name: "Defensor" },
  { slug: "desafiante", name: "Desafiante" },
  { slug: "dragon", name: "Dragón" },
  { slug: "druida", name: "Druida" },
  { slug: "eterno", name: "Eterno" },
  { slug: "faerie", name: "Faerie" },
  { slug: "faraon", name: "Faraón" },
  { slug: "goblin", name: "Goblin" },
  { slug: "heroe", name: "Héroe" },
  { slug: "minotauro", name: "Minotauro" },
  { slug: "olimpico", name: "Olímpico" },
  { slug: "sacerdote", name: "Sacerdote" },
  { slug: "sombra", name: "Sombra" },
  { slug: "titan", name: "Titán" },
];

function fold(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeMylEra(raw) {
  const s = fold(raw);
  if (!s) return "";
  if (s.includes("primer") && s.includes("bloque")) return "primer-bloque";
  if (s.includes("primera") || s === "pe") return "primera-era";
  if (s === "primer-bloque" || s === "pb" || s === "pbx") return "primer-bloque";
  if (s === "primera-era") return "primera-era";
  return MYL_ERAS.some((x) => x.slug === s) ? s : "";
}

export function normalizeMylEventType(raw) {
  const s = fold(raw);
  if (!s) return "";
  if (s.includes("avanz")) return "avanzado";
  if (s.includes("ocasion") || s.includes("casual")) return "ocasional";
  if (s.includes("prem")) return "premier";
  if (s.includes("liga")) return "liga";
  return MYL_EVENT_TYPES.some((x) => x.slug === s) ? s : "";
}

export function normalizeMylDeckFormat(raw) {
  const s = fold(raw);
  if (!s) return "";
  if (s.includes("soporte") || s.includes("libre-racial")) return "soporte-libre";
  if (s === "libre" || s.includes("full") || s.includes("mixto")) return "libre";
  if (s.includes("racial")) return "racial";
  return MYL_DECK_FORMATS.some((x) => x.slug === s) ? s : "";
}

export function mylRacesForEra(era) {
  const n = normalizeMylEra(era);
  if (n === "primer-bloque") return MYL_RACES_PRIMER_BLOQUE;
  if (n === "primera-era") return MYL_RACES_PRIMERA_ERA;
  const seen = new Set();
  const out = [];
  for (const r of [...MYL_RACES_PRIMERA_ERA, ...MYL_RACES_PRIMER_BLOQUE]) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push(r);
  }
  return out;
}

export function normalizeMylRace(raw, era) {
  const s = fold(raw);
  if (!s) return "";
  const list = mylRacesForEra(era);
  const hit = list.find((r) => r.slug === s || fold(r.name) === s);
  return hit ? hit.slug : "";
}

export function mylEraLabel(slug) {
  const n = normalizeMylEra(slug);
  return MYL_ERAS.find((t) => t.slug === n)?.name || "";
}

export function mylEventTypeLabel(slug) {
  const n = normalizeMylEventType(slug);
  return MYL_EVENT_TYPES.find((t) => t.slug === n)?.name || "";
}

export function mylDeckFormatLabel(slug) {
  const n = normalizeMylDeckFormat(slug);
  return MYL_DECK_FORMATS.find((t) => t.slug === n)?.name || "";
}

export function mylRaceLabel(slug, era) {
  const n = normalizeMylRace(slug, era);
  return mylRacesForEra(era).find((t) => t.slug === n)?.name || "";
}

export function parseMylRace(raw, era, { required = true } = {}) {
  const slug = normalizeMylRace(raw, era);
  if (!slug) {
    if (required) {
      const err = Object.assign(new Error("Elige la raza con la que vas a jugar."), { status: 400 });
      throw err;
    }
    return "";
  }
  return slug;
}
