/**
 * Perfiles de raza y grupos de edición para armar mazos MyL (reglas JO / FAQ PB).
 *
 * Construcción típica Primer Bloque:
 * - Mazo Castillo: 50 cartas
 * - Máx. 3 copias (salvo Carta Única / banlist)
 * - Racial: Aliados de UNA raza; mín. 16 Aliados (Racial Edición)
 * - Soporte edición: Armas/Tótems/Talismanes/Oros solo de la edición de la raza
 * - Soporte libre: soporte de cualquier edición del formato
 *
 * TOR no siempre tiene id de “raza de torneo”:
 * - Goblin → Faerie + concordancia de nombre «Goblin…» (HOBGLOBIN NO cuenta)
 * - Minotauro → Titán + nombre Minotauro…
 * - Druida → Defensor + nombre Druida…
 */

/** Ediciones semilla por formato (catálogo TOR). */
export const MYL_SEED_EDITIONS = {
  "primera-era": [
    "el_reto",
    "mundo_gotico",
    "ira_del_nahual",
    "ragnarok",
    "la_cofradia",
    "espiritu_del_dragon",
    "leyendas_pe",
    "leyendas_pe_2022",
    "leyendas_pe_2023",
    "extension_pe",
    "eXtension_pe",
    "raciales",
    "promocionales_pe",
    "xinnian",
  ],
  "primer-bloque": [
    "espada-sagrada",
    "cruzadas",
    "helenica",
    "imperio",
    "hijos_de_daana",
    "tierras_altas",
    "dominios_de_ra",
    "dominios-de-ra",
    "encrucijada",
    "raciales_pb",
    "espada_sagrada_aniversario",
    "helenica_aniversario",
    "hijos_de_daana_aniversario",
    "lpb_4.0",
    "leyendas_pb",
    "leyendas_2.0",
    "leyendas_3.0",
    "shogun",
    "shogun_ii",
    "shogun_iii",
  ],
};

/** Parejas de edición “hogar” (Racial soporte edición). */
export const MYL_EDITION_GROUPS = {
  espada: {
    label: "Espada Sagrada / Cruzadas",
    slugs: [
      "espada-sagrada",
      "cruzadas",
      "espada_sagrada_aniversario",
      "espada_sagrada_aniversario",
      "relatos_espada_sagrada",
    ],
  },
  helenica: {
    label: "Helénica / Imperio",
    slugs: ["helenica", "imperio", "helenica_aniversario", "relatos_helenica", "relatos_de_helenica"],
  },
  daana: {
    label: "Hijos de Daana / Tierras Altas",
    slugs: ["hijos_de_daana", "tierras_altas", "hijos_de_daana_aniversario"],
  },
  ra: {
    label: "Dominios de Ra / Encrucijada",
    slugs: ["dominios_de_ra", "dominios-de-ra", "encrucijada"],
  },
};

/**
 * @typedef {{
 *   slug: string,
 *   name: string,
 *   hint: string,
 *   torRaceSlugs: string[],
 *   nameIncludes: string[],
 *   nameExcludes?: string[],
 *   mode: 'tor-race' | 'name-line',
 *   homeGroup?: keyof typeof MYL_EDITION_GROUPS,
 * }} MylRaceProfile
 */

/** @type {Record<string, MylRaceProfile>} */
export const MYL_RACE_PROFILES = {
  caballero: {
    slug: "caballero",
    name: "Caballero",
    hint: "Aliados raza Caballero. Hogar: Espada Sagrada / Cruzadas.",
    torRaceSlugs: ["caballero"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "espada",
  },
  faerie: {
    slug: "faerie",
    name: "Faerie",
    hint: "Aliados raza Faerie (Avalon, elfos… e incluye Goblins en TOR). Hogar: Espada Sagrada / Cruzadas.",
    torRaceSlugs: ["faerie"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "espada",
  },
  goblin: {
    slug: "goblin",
    name: "Goblin",
    hint: "Línea de nombre «Goblin…» (FAQ: HOBGLOBIN no cuenta). En TOR son Faerie. Hogar: Espada Sagrada / Cruzadas.",
    torRaceSlugs: ["faerie"],
    nameIncludes: ["goblin"],
    nameExcludes: ["hobglobin"],
    mode: "name-line",
    homeGroup: "espada",
  },
  dragon: {
    slug: "dragon",
    name: "Dragón",
    hint: "Aliados raza Dragón. Hogar: Espada Sagrada / Cruzadas.",
    torRaceSlugs: ["dragon"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "espada",
  },
  eterno: {
    slug: "eterno",
    name: "Eterno",
    hint: "Aliados raza Eterno. Hogar: Espada Sagrada / Cruzadas.",
    torRaceSlugs: ["eterno"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "espada",
  },
  sacerdote: {
    slug: "sacerdote",
    name: "Sacerdote",
    hint: "Aliados raza Sacerdote. Hogar: Espada Sagrada / Cruzadas.",
    torRaceSlugs: ["sacerdote"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "espada",
  },
  heroe: {
    slug: "heroe",
    name: "Héroe",
    hint: "Aliados raza Héroe. Hogar: Helénica / Imperio.",
    torRaceSlugs: ["heroe"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "helenica",
  },
  olimpico: {
    slug: "olimpico",
    name: "Olímpico",
    hint: "Aliados raza Olímpico. Hogar: Helénica / Imperio.",
    torRaceSlugs: ["olimpico"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "helenica",
  },
  titan: {
    slug: "titan",
    name: "Titán",
    hint: "Aliados raza Titán (incluye Minotauros). Hogar: Helénica / Imperio.",
    torRaceSlugs: ["titan"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "helenica",
  },
  minotauro: {
    slug: "minotauro",
    name: "Minotauro",
    hint: "Línea Minotauro… (en TOR suelen ser Titán). Hogar: Helénica / Imperio.",
    torRaceSlugs: ["titan"],
    nameIncludes: ["minotauro"],
    mode: "name-line",
    homeGroup: "helenica",
  },
  sombra: {
    slug: "sombra",
    name: "Sombra",
    hint: "Aliados raza Sombra. Hogar: Hijos de Daana / Tierras Altas.",
    torRaceSlugs: ["sombra"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "daana",
  },
  desafiante: {
    slug: "desafiante",
    name: "Desafiante",
    hint: "Aliados raza Desafiante. Hogar: Hijos de Daana / Tierras Altas.",
    torRaceSlugs: ["desafiante"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "daana",
  },
  defensor: {
    slug: "defensor",
    name: "Defensor",
    hint: "Aliados raza Defensor (incluye varios Druida…). Hogar: Hijos de Daana / Tierras Altas.",
    torRaceSlugs: ["defensor"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "daana",
  },
  druida: {
    slug: "druida",
    name: "Druida",
    hint: "Línea Druida… (en TOR suelen ser Defensor). Hogar: Hijos de Daana / Tierras Altas.",
    torRaceSlugs: ["defensor", "faerie"],
    nameIncludes: ["druida"],
    mode: "name-line",
    homeGroup: "daana",
  },
  faraon: {
    slug: "faraon",
    name: "Faraón",
    hint: "Aliados raza Faraón. Hogar: Dominios de Ra / Encrucijada.",
    torRaceSlugs: ["faraon"],
    nameIncludes: [],
    mode: "tor-race",
    homeGroup: "ra",
  },
  // PE
  barbaro: {
    slug: "barbaro",
    name: "Bárbaro",
    hint: "Aliados raza Bárbaro (Primera Era).",
    torRaceSlugs: ["barbaro"],
    nameIncludes: [],
    mode: "tor-race",
  },
  bestia: {
    slug: "bestia",
    name: "Bestia",
    hint: "Aliados raza Bestia (Primera Era).",
    torRaceSlugs: ["bestia"],
    nameIncludes: [],
    mode: "tor-race",
  },
  guerrero: {
    slug: "guerrero",
    name: "Guerrero",
    hint: "Aliados raza Guerrero (Primera Era).",
    torRaceSlugs: ["guerrero"],
    nameIncludes: [],
    mode: "tor-race",
  },
  vampiro: {
    slug: "vampiro",
    name: "Vampiro",
    hint: "Aliados raza Vampiro (Primera Era).",
    torRaceSlugs: ["vampiro"],
    nameIncludes: [],
    mode: "tor-race",
  },
  licantropo: {
    slug: "licantropo",
    name: "Licántropo",
    hint: "Aliados raza Licántropo (Primera Era).",
    torRaceSlugs: ["licantropo"],
    nameIncludes: [],
    mode: "tor-race",
  },
  cazador: {
    slug: "cazador",
    name: "Cazador",
    hint: "Aliados raza Cazador (Primera Era).",
    torRaceSlugs: ["cazador"],
    nameIncludes: [],
    mode: "tor-race",
  },
  chaman: {
    slug: "chaman",
    name: "Chamán",
    hint: "Aliados raza Chamán (Primera Era).",
    torRaceSlugs: ["chaman"],
    nameIncludes: [],
    mode: "tor-race",
  },
  dios: {
    slug: "dios",
    name: "Dios",
    hint: "Aliados raza Dios (Primera Era).",
    torRaceSlugs: ["dios"],
    nameIncludes: [],
    mode: "tor-race",
  },
  abominacion: {
    slug: "abominacion",
    name: "Abominación",
    hint: "Aliados raza Abominación (Primera Era).",
    torRaceSlugs: ["abominacion"],
    nameIncludes: [],
    mode: "tor-race",
  },
  kami: {
    slug: "kami",
    name: "Kami",
    hint: "Aliados raza Kami (Primera Era).",
    torRaceSlugs: ["kami"],
    nameIncludes: [],
    mode: "tor-race",
  },
  xian: {
    slug: "xian",
    name: "Xian",
    hint: "Aliados raza Xian (Primera Era).",
    torRaceSlugs: ["xian"],
    nameIncludes: [],
    mode: "tor-race",
  },
  criaturas: {
    slug: "criaturas",
    name: "Criaturas",
    hint: "Aliados raza Criaturas (Primera Era).",
    torRaceSlugs: ["criaturas"],
    nameIncludes: [],
    mode: "tor-race",
  },
  campeon: {
    slug: "campeon",
    name: "Campeón",
    hint: "Aliados raza Campeón (Primera Era).",
    torRaceSlugs: ["campeon", "campeon/shaolin", "campeon/ninja", "campeon/samurai"],
    nameIncludes: [],
    mode: "tor-race",
  },
};

export function getMylRaceProfile(raceSlug) {
  const s = String(raceSlug || "")
    .trim()
    .toLowerCase();
  return MYL_RACE_PROFILES[s] || null;
}

export function nameMatchesAny(name, needles) {
  const n = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return needles.some((needle) => {
    const x = String(needle || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return x && n.includes(x);
  });
}

export function nameMatchesNone(name, needles) {
  if (!needles?.length) return true;
  return !nameMatchesAny(name, needles);
}

/**
 * @param {string} editionSlug
 * @param {keyof typeof MYL_EDITION_GROUPS | undefined} homeGroup
 */
export function editionInHomeGroup(editionSlug, homeGroup) {
  if (!homeGroup) return true;
  const group = MYL_EDITION_GROUPS[homeGroup];
  if (!group) return true;
  const s = String(editionSlug || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  return group.slugs.some((slug) => {
    const g = String(slug).toLowerCase().replace(/-/g, "_");
    return s === g || s.includes(g) || g.includes(s);
  });
}

/**
 * @param {{ name?: string, race?: string|null, type?: string|null, raceSlug?: string|null, edition_slug?: string }} card
 * @param {MylRaceProfile} profile
 * @param {Map<string, string>} raceIdToSlug
 * @param {{ deckFormat?: string, forSupport?: boolean }} [opts]
 */
export function cardMatchesRaceProfile(card, profile, raceIdToSlug, opts = {}) {
  const name = String(card.name || "");
  const typeId = String(card.type ?? "");
  const isAlly = typeId === "1";
  const raceSlug =
    card.raceSlug ||
    (card.race != null && card.race !== "" ? raceIdToSlug.get(String(card.race)) : null) ||
    "";
  const deckFormat = String(opts.deckFormat || "soporte-libre");
  const forSupport = opts.forSupport === true;

  if (forSupport || !isAlly) {
    // Soporte: racial-edición → solo ediciones hogar; soporte-libre/libre → cualquier edición del formato.
    // Name-line (Goblin/Minotauro/Druida) restringe Aliados por nombre, no el soporte.
    if (deckFormat === "racial" || deckFormat === "soporte-edicion") {
      if (!editionInHomeGroup(String(card.edition_slug || card.ed_slug || ""), profile.homeGroup)) {
        return false;
      }
    }
    return !isAlly;
  }

  // Aliados
  if (profile.mode === "name-line") {
    return nameMatchesAny(name, profile.nameIncludes) && nameMatchesNone(name, profile.nameExcludes || []);
  }

  if (!profile.torRaceSlugs.length) return false;
  return profile.torRaceSlugs.includes(String(raceSlug));
}
