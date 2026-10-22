// src/lib/pokemon/deckParser.ts
var SECTION_POKEMON = /^(?:pokémon|pokemon)\b/i;
var SECTION_TRAINER = /^(?:trainer|trainers|entrenador(?:es)?)\b/i;
var SECTION_ENERGY = /^(?:energy|energ[íi]a)\b/i;
var CARD_WITH_SET_REGEX = /^(\d+)\s+(.+?)\s+([A-Z0-9]{2,4})\s+(\d+[a-zA-Z]?)$/;
var QTY_NAME_REGEX = /^(\d+)\s+(.+)$/;
function splitIntoBlocks(text) {
  const blocks = [];
  let current = [];
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
function hasExplicitSectionHeaders(text) {
  return /^(?:pokémon|pokemon|trainer|trainers|entrenador(?:es)?|energy|energ[íi]a)\b/im.test(
    text
  );
}
function hasStructuredDeckSections(text) {
  if (hasExplicitSectionHeaders(text)) return true;
  const blocks = splitIntoBlocks(text.replace(/\uFEFF/g, ""));
  return blocks.length >= 2 && blocks.length <= 3;
}
function resolveLineCategory(name, opts) {
  if (opts.currentSection) return opts.currentSection;
  const guessed = categorizeByName(name);
  if (guessed === "energy") return "energy";
  if (guessed === "trainer") return "trainer";
  if (opts.defaultNonEnergyCategory) return opts.defaultNonEnergyCategory;
  return guessed;
}
function parseDeckLine(line, opts, cards, errors) {
  const setMatch = line.match(CARD_WITH_SET_REGEX);
  if (setMatch) {
    const qty = parseInt(setMatch[1], 10);
    if (qty < 1 || qty > 60) {
      errors.push(`Cantidad no v\xE1lida en la l\xEDnea: ${line}`);
      return;
    }
    const name = setMatch[2].trim();
    const category = resolveLineCategory(name, opts);
    if (opts.requireSet && category === "pokemon") {
    } else if (opts.requireSet && category !== "pokemon") {
    }
    cards.push({
      qty,
      name,
      setCode: setMatch[3],
      number: setMatch[4],
      lineRaw: line,
      category: opts.currentSection ?? category,
      sectionAssigned: opts.sectionAssigned
    });
    return;
  }
  if (opts.allowQtyNameOnly) {
    const qtyMatch = line.match(QTY_NAME_REGEX);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10);
      if (qty < 1 || qty > 60) {
        errors.push(`Cantidad no v\xE1lida en la l\xEDnea: ${line}`);
        return;
      }
      const name = qtyMatch[2].trim();
      const category = resolveLineCategory(name, opts);
      cards.push({
        qty,
        name,
        lineRaw: line,
        category,
        sectionAssigned: opts.sectionAssigned
      });
      return;
    }
  }
  if (opts.requireSet) {
    errors.push(`Los Pok\xE9mon deben incluir set y n\xFAmero (ej. 4 Toxel PFL 67): ${line}`);
  } else {
    errors.push(`No se pudo leer la l\xEDnea: ${line}`);
  }
}
function isSectionHeaderLine(line) {
  if (SECTION_POKEMON.test(line)) return "pokemon";
  if (SECTION_TRAINER.test(line)) return "trainer";
  if (SECTION_ENERGY.test(line)) return "energy";
  return null;
}
function isIgnorableDeckLine(line) {
  if (isSectionHeaderLine(line)) return true;
  if (/^(?:pokémon|pokemon|trainer|trainers|energy|energ[íi]a)\s*:\s*\d+/i.test(
    line
  )) {
    return true;
  }
  if (/^cartas\s+totales\s*:/i.test(line)) return true;
  if (/^total\s+cards?\s*:/i.test(line)) return true;
  if (/^(?:total|totales)\s*:/i.test(line)) return true;
  if (!/^\d+\b/.test(line)) return true;
  return false;
}
function finalizeParse(cards, errors, warnings) {
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
    isValid: errors.length === 0
  };
}
function parseBlockedDecklist(blocks, errors, warnings) {
  const cards = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    let blockSection;
    let requireSet;
    let allowQtyNameOnly;
    let defaultNonEnergyCategory;
    if (blocks.length === 3) {
      blockSection = i === 0 ? "pokemon" : i === 1 ? "trainer" : "energy";
      requireSet = i === 0;
      allowQtyNameOnly = i > 0;
    } else if (blocks.length === 2) {
      blockSection = i === 0 ? "pokemon" : null;
      requireSet = i === 0;
      allowQtyNameOnly = i === 1;
      defaultNonEnergyCategory = i === 1 ? "trainer" : void 0;
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
          defaultNonEnergyCategory
        },
        cards,
        errors
      );
    }
  }
  return finalizeParse(cards, errors, warnings);
}
var TRAINER_NAME_HINT = /\b(ultra ball|nest ball|level ball|great ball|quick ball|pok[eé] ?ball|pok[eé] ?pad|pok[eé]gear|air balloon|punk helmet|night stretcher|energy switch|energy recycler|counter catcher|boss'?s orders|professor'?s research|iono|arven|judge|lillie'?s determination|rare candy|super rod|rescue board|technical machine|bravery charm|exp\. share|pal pad|crushing hammer|escape rope|electrical generator|secret box|buddy-buddy|mystery food|earthen vessel|team rocket'?s (?:petrel|factory|watchtower|transceiver|admin|archer|gambler|great ball|hypnosis|mewtwo|persian|proton|receiver|weezing|wobbuffet)|artazon|area zero|temple of sinnoh|hand trimmer|stadium|tool)\b/i;
var POKEMON_NAME_HINT = /\b(ex|vstar|vmax|\sv\b| gx\b| radiante\b| ◇)\b/i;
var BASIC_ENERGY_TYPES = /* @__PURE__ */ new Set([
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
  "colorless"
]);
var BASIC_ENERGY_SYMBOLS = /* @__PURE__ */ new Set([
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
  "C"
]);
function isBasicEnergy(name) {
  const n = name.trim();
  const symbol = n.match(/^(?:Basic\s+)?\{([A-Z])\}\s+Energy$/i);
  if (symbol && BASIC_ENERGY_SYMBOLS.has(symbol[1].toUpperCase())) return true;
  if (/^Basic(?:\s+\w+)+\s+Energy$/i.test(n)) return true;
  const match = n.match(/^(\w+)\s+Energy$/i);
  if (match && BASIC_ENERGY_TYPES.has(match[1].toLowerCase())) return true;
  return false;
}
function isEnergyCardName(name) {
  const n = name.trim();
  return isBasicEnergy(n) || /\benergy\b|\benerg[íi]a\b/i.test(n);
}
function categorizeByName(name) {
  if (TRAINER_NAME_HINT.test(name)) return "trainer";
  if (isEnergyCardName(name)) return "energy";
  if (POKEMON_NAME_HINT.test(name)) return "pokemon";
  return "pokemon";
}
function mergeCategoryCards(cards) {
  const pokemon = [];
  const trainer = [];
  const energy = [];
  for (const card of cards) {
    if (card.category === "energy") energy.push(card);
    else if (card.category === "trainer") trainer.push(card);
    else pokemon.push(card);
  }
  const sum = (list) => list.reduce((acc, c) => acc + c.qty, 0);
  return {
    pokemon,
    trainer,
    energy,
    totals: {
      pokemon: sum(pokemon),
      trainer: sum(trainer),
      energy: sum(energy)
    }
  };
}
function validateCopyLimit(cards) {
  const byName = /* @__PURE__ */ new Map();
  for (const card of cards) {
    const key = card.name.trim().toLowerCase();
    byName.set(key, (byName.get(key) ?? 0) + card.qty);
  }
  const errors = [];
  for (const [nameKey, qty] of byName) {
    if (qty <= 4) continue;
    const displayName = cards.find((c) => c.name.trim().toLowerCase() === nameKey)?.name ?? nameKey;
    if (isBasicEnergy(displayName)) continue;
    errors.push(
      `"${displayName}" tiene ${qty} copias; el m\xE1ximo permitido es 4 (excepto Energ\xEDas B\xE1sicas).`
    );
  }
  return errors;
}
function parsePokemonDecklist(text) {
  const errors = [];
  const warnings = [];
  const cards = [];
  const normalized = text.replace(/\uFEFF/g, "");
  const blocks = splitIntoBlocks(normalized);
  if (!hasExplicitSectionHeaders(normalized) && blocks.length >= 2 && blocks.length <= 3) {
    return parseBlockedDecklist(blocks, errors, warnings);
  }
  let currentSection = null;
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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
        allowQtyNameOnly: true
      },
      cards,
      errors
    );
  }
  return finalizeParse(cards, errors, warnings);
}
function toStoredParsedCards(cards) {
  return cards.map(({ qty, name, setCode, number, category }) => ({
    qty,
    name,
    setCode,
    number,
    category
  }));
}
function resolveDeckCategories(cards, rawText) {
  const hasStoredCategories = cards.some((c) => c.category);
  if (hasStoredCategories) {
    return mergeCategoryCards(
      cards.map((c) => ({
        qty: c.qty,
        name: c.name,
        setCode: c.setCode,
        number: c.number,
        lineRaw: "",
        category: c.category ?? categorizeByName(c.name)
      }))
    );
  }
  if (rawText?.trim()) {
    const parsed = parsePokemonDecklist(rawText);
    if (parsed.cards.length > 0) return parsed.categories;
  }
  const withCategory = cards.map((c) => ({
    qty: c.qty,
    name: c.name,
    setCode: c.setCode,
    number: c.number,
    lineRaw: "",
    category: c.category ?? categorizeByName(c.name)
  }));
  return mergeCategoryCards(withCategory);
}
function groupParsedCardsByName(cards) {
  const map = /* @__PURE__ */ new Map();
  for (const card of cards) {
    const key = `${card.name}|${card.setCode ?? ""}|${card.number ?? ""}|${card.category}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += card.qty;
    } else {
      map.set(key, { ...card });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.name.localeCompare(b.name, "es")
  );
}
export {
  categorizeByName,
  groupParsedCardsByName,
  hasStructuredDeckSections,
  isBasicEnergy,
  isEnergyCardName,
  mergeCategoryCards,
  parsePokemonDecklist,
  resolveDeckCategories,
  toStoredParsedCards
};
