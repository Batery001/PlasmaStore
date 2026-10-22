/** Parser y validador de decklists Pokémon TCG (export PTCGL / Limitless). */

export type DeckCardCategory = "pokemon" | "trainer" | "energy";

export interface ParsedDeckCard {
  qty: number;
  name: string;
  setCode?: string;
  number?: string;
  lineRaw: string;
  category: DeckCardCategory;
  /** Marca de regulación (G/H/I/J) si se resolvió. */
  regulationMark?: string;
  /** true si la categoría vino de un encabezado PTCGL (Pokémon:/Trainer:/Energy:). */
  sectionAssigned?: boolean;
}

export interface StoredDeckCard {
  qty: number;
  name: string;
  setCode?: string;
  number?: string;
  category?: DeckCardCategory;
}

export interface DeckCategoryPreview {
  pokemon: ParsedDeckCard[];
  trainer: ParsedDeckCard[];
  energy: ParsedDeckCard[];
  totals: { pokemon: number; trainer: number; energy: number };
}

export interface PokemonDeckParseResult {
  cards: ParsedDeckCard[];
  errors: string[];
  warnings: string[];
  cardCount: number;
  categories: DeckCategoryPreview;
  isValid: boolean;
}

const SECTION_POKEMON = /^(?:pokémon|pokemon)\b/i;
const SECTION_TRAINER = /^(?:trainer|trainers|entrenador(?:es)?)\b/i;
const SECTION_ENERGY = /^(?:energy|energ[íi]a)\b/i;

/** Formato estándar: `4 Charmander OBF 26` · `2 Boss's Orders PAL 172` */
const CARD_WITH_SET_REGEX =
  /^(\d+)\s+(.+?)\s+([A-Z0-9]{2,4})\s+(\d+[a-zA-Z]?)$/;

/** Solo cantidad + nombre (entrenadores / energías sin set). */
const QTY_NAME_REGEX = /^(\d+)\s+(.+)$/;

function splitIntoBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(current);
  return blocks;
}

function hasExplicitSectionHeaders(text: string): boolean {
  return /^(?:pokémon|pokemon|trainer|trainers|entrenador(?:es)?|energy|energ[íi]a)\b/im.test(
    text
  );
}

/** Encabezados PTCGL o bloques separados por línea en blanco (Pokémon / Entrenadores / Energías). */
export function hasStructuredDeckSections(text: string): boolean {
  if (hasExplicitSectionHeaders(text)) return true;
  const blocks = splitIntoBlocks(text.replace(/\uFEFF/g, ""));
  return blocks.length >= 2 && blocks.length <= 3;
}

interface LineParseOptions {
  currentSection: DeckCardCategory | null;
  sectionAssigned: boolean;
  /** Los Pokémon deben traer `SET 123`. */
  requireSet: boolean;
  /** Permite `4 Ultra Ball` sin código de expansión. */
  allowQtyNameOnly: boolean;
  /** En bloque mixto (entrenadores + energías), default si no es energía. */
  defaultNonEnergyCategory?: DeckCardCategory;
}

function resolveLineCategory(
  name: string,
  opts: LineParseOptions
): DeckCardCategory {
  if (opts.currentSection) return opts.currentSection;
  const guessed = categorizeByName(name);
  if (guessed === "energy") return "energy";
  if (guessed === "trainer") return "trainer";
  if (opts.defaultNonEnergyCategory) return opts.defaultNonEnergyCategory;
  return guessed;
}

function parseDeckLine(
  line: string,
  opts: LineParseOptions,
  cards: ParsedDeckCard[],
  errors: string[]
): void {
  const setMatch = line.match(CARD_WITH_SET_REGEX);
  if (setMatch) {
    const qty = parseInt(setMatch[1], 10);
    if (qty < 1 || qty > 60) {
      errors.push(`Cantidad no válida en la línea: ${line}`);
      return;
    }
    const name = setMatch[2].trim();
    const category = resolveLineCategory(name, opts);
    if (opts.requireSet && category === "pokemon") {
      // ok — tiene set
    } else if (opts.requireSet && category !== "pokemon") {
      // entrenador con set en bloque pokémon: respetar sección forzada
    }
    cards.push({
      qty,
      name,
      setCode: setMatch[3],
      number: setMatch[4],
      lineRaw: line,
      category: opts.currentSection ?? category,
      sectionAssigned: opts.sectionAssigned,
    });
    return;
  }

  if (opts.allowQtyNameOnly) {
    const qtyMatch = line.match(QTY_NAME_REGEX);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10);
      if (qty < 1 || qty > 60) {
        errors.push(`Cantidad no válida en la línea: ${line}`);
        return;
      }
      const name = qtyMatch[2].trim();
      const category = resolveLineCategory(name, opts);
      cards.push({
        qty,
        name,
        lineRaw: line,
        category,
        sectionAssigned: opts.sectionAssigned,
      });
      return;
    }
  }

  if (opts.requireSet) {
    errors.push(`Los Pokémon deben incluir set y número (ej. 4 Toxel PFL 67): ${line}`);
  } else {
    errors.push(`No se pudo leer la línea: ${line}`);
  }
}

function isSectionHeaderLine(line: string): DeckCardCategory | null {
  if (SECTION_POKEMON.test(line)) return "pokemon";
  if (SECTION_TRAINER.test(line)) return "trainer";
  if (SECTION_ENERGY.test(line)) return "energy";
  return null;
}

/** Encabezados, totales y basura de export (TCG Live / Limitless / builder). */
function isIgnorableDeckLine(line: string): boolean {
  if (isSectionHeaderLine(line)) return true;
  if (
    /^(?:pokémon|pokemon|trainer|trainers|energy|energ[íi]a)\s*:\s*\d+/i.test(
      line
    )
  ) {
    return true;
  }
  if (/^cartas\s+totales\s*:/i.test(line)) return true;
  if (/^total\s+cards?\s*:/i.test(line)) return true;
  if (/^(?:total|totales)\s*:/i.test(line)) return true;
  if (!/^\d+\b/.test(line)) return true;
  return false;
}

function finalizeParse(
  cards: ParsedDeckCard[],
  errors: string[],
  warnings: string[]
): PokemonDeckParseResult {
  const cardCount = cards.reduce((sum, c) => sum + c.qty, 0);

  if (cardCount !== 60) {
    errors.push(
      `Tu mazo tiene ${cardCount} cartas, deben ser exactamente 60.`
    );
  }

  errors.push(...validateCopyLimit(cards));

  return {
    cards,
    errors,
    warnings,
    cardCount,
    categories: mergeCategoryCards(cards),
    isValid: errors.length === 0,
  };
}

function parseBlockedDecklist(
  blocks: string[][],
  errors: string[],
  warnings: string[]
): PokemonDeckParseResult {
  const cards: ParsedDeckCard[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    let blockSection: DeckCardCategory | null;
    let requireSet: boolean;
    let allowQtyNameOnly: boolean;
    let defaultNonEnergyCategory: DeckCardCategory | undefined;

    if (blocks.length === 3) {
      blockSection = i === 0 ? "pokemon" : i === 1 ? "trainer" : "energy";
      requireSet = i === 0;
      allowQtyNameOnly = i > 0;
    } else if (blocks.length === 2) {
      blockSection = i === 0 ? "pokemon" : null;
      requireSet = i === 0;
      allowQtyNameOnly = i === 1;
      defaultNonEnergyCategory = i === 1 ? "trainer" : undefined;
    } else {
      blockSection = "pokemon";
      requireSet = true;
      allowQtyNameOnly = false;
    }

    for (const line of block) {
      if (isIgnorableDeckLine(line)) continue;

      parseDeckLine(
        line,
        {
          currentSection: blockSection,
          sectionAssigned: true,
          requireSet,
          allowQtyNameOnly,
          defaultNonEnergyCategory,
        },
        cards,
        errors
      );
    }
  }

  return finalizeParse(cards, errors, warnings);
}

const TRAINER_NAME_HINT =
  /\b(ultra ball|nest ball|level ball|great ball|quick ball|pok[eé] ?ball|pok[eé] ?pad|pok[eé]gear|air balloon|punk helmet|night stretcher|energy switch|energy recycler|counter catcher|boss'?s orders|professor'?s research|iono|arven|judge|lillie'?s determination|rare candy|super rod|rescue board|technical machine|bravery charm|exp\. share|pal pad|crushing hammer|escape rope|electrical generator|secret box|buddy-buddy|mystery food|earthen vessel|team rocket'?s (?:petrel|factory|watchtower|transceiver|admin|archer|gambler|great ball|hypnosis|mewtwo|persian|proton|receiver|weezing|wobbuffet)|artazon|area zero|temple of sinnoh|hand trimmer|stadium|tool)\b/i;

/** Cartas con Rule Box que suelen ser Pokémon aunque el nombre no lo indique. */
const POKEMON_NAME_HINT =
  /\b(ex|vstar|vmax|\sv\b| gx\b| radiante\b| ◇)\b/i;

const BASIC_ENERGY_TYPES = new Set([
  "grass",
  "fire",
  "water",
  "lightning",
  "psychic",
  "fighting",
  "darkness",
  "dark",
  "metal",
  "fairy",
  "dragon",
  "colorless",
]);

const BASIC_ENERGY_SYMBOLS = new Set([
  "G",
  "R",
  "W",
  "L",
  "P",
  "F",
  "D",
  "M",
  "Y",
  "N",
  "C",
]);

/** Energía básica sin límite de 4 copias (PTCGL / Limitless / {F}). */
export function isBasicEnergy(name: string): boolean {
  const n = name.trim();
  const symbol = n.match(/^(?:Basic\s+)?\{([A-Z])\}\s+Energy$/i);
  if (symbol && BASIC_ENERGY_SYMBOLS.has(symbol[1].toUpperCase())) return true;
  if (/^Basic(?:\s+\w+)+\s+Energy$/i.test(n)) return true;
  const match = n.match(/^(\w+)\s+Energy$/i);
  if (match && BASIC_ENERGY_TYPES.has(match[1].toLowerCase())) return true;
  return false;
}

export function isEnergyCardName(name: string): boolean {
  const n = name.trim();
  return isBasicEnergy(n) || /\benergy\b|\benerg[íi]a\b/i.test(n);
}

export function categorizeByName(name: string): DeckCardCategory {
  if (TRAINER_NAME_HINT.test(name)) return "trainer";
  if (isEnergyCardName(name)) return "energy";
  if (POKEMON_NAME_HINT.test(name)) return "pokemon";
  return "pokemon";
}

export function mergeCategoryCards(
  cards: ParsedDeckCard[]
): DeckCategoryPreview {
  const pokemon: ParsedDeckCard[] = [];
  const trainer: ParsedDeckCard[] = [];
  const energy: ParsedDeckCard[] = [];

  for (const card of cards) {
    if (card.category === "energy") energy.push(card);
    else if (card.category === "trainer") trainer.push(card);
    else pokemon.push(card);
  }

  const sum = (list: ParsedDeckCard[]) =>
    list.reduce((acc, c) => acc + c.qty, 0);

  return {
    pokemon,
    trainer,
    energy,
    totals: {
      pokemon: sum(pokemon),
      trainer: sum(trainer),
      energy: sum(energy),
    },
  };
}

function validateCopyLimit(cards: ParsedDeckCard[]): string[] {
  const byName = new Map<string, number>();

  for (const card of cards) {
    const key = card.name.trim().toLowerCase();
    byName.set(key, (byName.get(key) ?? 0) + card.qty);
  }

  const errors: string[] = [];
  for (const [nameKey, qty] of byName) {
    if (qty <= 4) continue;
    const displayName =
      cards.find((c) => c.name.trim().toLowerCase() === nameKey)?.name ??
      nameKey;
    if (isBasicEnergy(displayName)) continue;
    errors.push(
      `"${displayName}" tiene ${qty} copias; el máximo permitido es 4 (excepto Energías Básicas).`
    );
  }

  return errors;
}

/**
 * Parsea y valida un mazo exportado de Pokémon TCG Live u otro formato compatible.
 */
export function parsePokemonDecklist(text: string): PokemonDeckParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cards: ParsedDeckCard[] = [];

  const normalized = text.replace(/\uFEFF/g, "");
  const blocks = splitIntoBlocks(normalized);

  if (
    !hasExplicitSectionHeaders(normalized) &&
    blocks.length >= 2 &&
    blocks.length <= 3
  ) {
    return parseBlockedDecklist(blocks, errors, warnings);
  }

  let currentSection: DeckCardCategory | null = null;

  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const header = isSectionHeaderLine(line);
    if (header) {
      currentSection = header;
      continue;
    }

    if (isIgnorableDeckLine(line)) continue;

    const usedSection = currentSection !== null;
    parseDeckLine(
      line,
      {
        currentSection,
        sectionAssigned: usedSection,
        requireSet: false,
        allowQtyNameOnly: true,
      },
      cards,
      errors
    );
  }

  return finalizeParse(cards, errors, warnings);
}

/** Cartas sin `lineRaw` para persistir en BD (incluye categoría). */
export function toStoredParsedCards(cards: ParsedDeckCard[]): StoredDeckCard[] {
  return cards.map(({ qty, name, setCode, number, category }) => ({
    qty,
    name,
    setCode,
    number,
    category,
  }));
}

/** Agrupa cartas almacenadas o parseadas en secciones Pokémon / Entrenadores / Energías. */
export function resolveDeckCategories(
  cards: StoredDeckCard[],
  rawText?: string
): DeckCategoryPreview {
  const hasStoredCategories = cards.some((c) => c.category);
  if (hasStoredCategories) {
    return mergeCategoryCards(
      cards.map((c) => ({
        qty: c.qty,
        name: c.name,
        setCode: c.setCode,
        number: c.number,
        lineRaw: "",
        category: c.category ?? categorizeByName(c.name),
      }))
    );
  }

  if (rawText?.trim()) {
    const parsed = parsePokemonDecklist(rawText);
    if (parsed.cards.length > 0) return parsed.categories;
  }

  const withCategory: ParsedDeckCard[] = cards.map((c) => ({
    qty: c.qty,
    name: c.name,
    setCode: c.setCode,
    number: c.number,
    lineRaw: "",
    category: c.category ?? categorizeByName(c.name),
  }));

  return mergeCategoryCards(withCategory);
}

export function groupParsedCardsByName(
  cards: ParsedDeckCard[]
): ParsedDeckCard[] {
  const map = new Map<string, ParsedDeckCard>();

  for (const card of cards) {
    const key = `${card.name}|${card.setCode ?? ""}|${card.number ?? ""}|${card.category}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += card.qty;
    } else {
      map.set(key, { ...card });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}
