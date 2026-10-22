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

// src/lib/pokemon/regulation.ts
var SET_REGULATION_MARK = {
  SVI: "G",
  PAL: "G",
  OBF: "G",
  MEW: "G",
  PAR: "G",
  PAF: "G",
  TEF: "G",
  TWM: "H",
  SFA: "H",
  SCR: "H",
  SSP: "H",
  PRE: "H",
  JTG: "I",
  DRI: "I",
  BLK: "I",
  WHT: "I",
  MEG: "I",
  PFL: "I",
  ASC: "I",
  POR: "J",
  SVP: "H",
  SVE: "H",
  MEP: "I",
  MEE: "I"
};
function regulationMarkForSet(setCode) {
  if (!setCode) return null;
  return SET_REGULATION_MARK[setCode.trim().toUpperCase()] ?? null;
}
function formatMarksList(marks) {
  return marks.map((m) => m.toUpperCase()).join(", ");
}
function checkRegulationMarks(cards, allowedMarks) {
  const allowed = new Set(
    allowedMarks.map((m) => m.trim().toUpperCase()).filter(Boolean)
  );
  const errors = [];
  const warnings = [];
  if (allowed.size === 0) return { errors, warnings };
  const seen = /* @__PURE__ */ new Set();
  for (const card of cards) {
    if (isBasicEnergy(card.name)) continue;
    if (card.category === "trainer" || card.category === "energy") continue;
    const mark = card.regulationMark?.trim().toUpperCase() || regulationMarkForSet(card.setCode);
    const label = card.setCode ? `${card.name} (${card.setCode}${card.number ? ` ${card.number}` : ""})` : card.name;
    const key = `${label}|${mark ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!mark) {
      if (card.setCode) {
        warnings.push(
          `No se pudo comprobar la regulaci\xF3n de ${label}. Revisa que sea legal en Standard.`
        );
      }
      continue;
    }
    if (!allowed.has(mark)) {
      errors.push(
        `${label} es regulaci\xF3n ${mark}. Este torneo admite ${formatMarksList([...allowed])}.`
      );
    }
  }
  return { errors, warnings };
}

// src/lib/pokemon/limitless-set-codes.ts
var LIMITLESS_TO_TCGDEX_SET = {
  // Scarlet & Violet
  SVI: "sv01",
  PAL: "sv02",
  OBF: "sv03",
  MEW: "sv03.5",
  PAR: "sv04",
  PAF: "sv04.5",
  TEF: "sv05",
  TWM: "sv06",
  SFA: "sv06.5",
  SCR: "sv07",
  SSP: "sv08",
  PRE: "sv08.5",
  JTG: "sv09",
  DRI: "sv10",
  BLK: "sv10.5b",
  WHT: "sv10.5w",
  SVP: "svp",
  SVE: "sve",
  // Mega Evolution
  MEG: "me01",
  PFL: "me02",
  ASC: "me02.5",
  POR: "me03",
  MEP: "mep",
  MEE: "mee",
  // Sword & Shield (frecuentes en mazos legacy)
  SSH: "swsh1",
  RCL: "swsh2",
  DAA: "swsh3",
  CPA: "swsh3.5",
  VIV: "swsh4",
  SHF: "swsh4.5",
  BST: "swsh5",
  CRE: "swsh6",
  EVS: "swsh7",
  CEL: "cel25",
  FST: "swsh8",
  BRS: "swsh9",
  ASR: "swsh10",
  PGO: "swsh10.5",
  LOR: "swsh11",
  SIT: "swsh12",
  CRZ: "swsh12.5",
  // Energías básicas clásicas
  HS: "hgss1"
};
function limitlessSetToTcgdex(setCode) {
  const key = setCode.trim().toUpperCase();
  return LIMITLESS_TO_TCGDEX_SET[key] ?? null;
}
var TCGDEX_TO_LIMITLESS = Object.fromEntries(
  Object.entries(LIMITLESS_TO_TCGDEX_SET).map(([ll, tcx]) => [tcx, ll])
);

// src/lib/pokemon/tcgdex.ts
var TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
var FETCH_TIMEOUT_MS = 8e3;
var categoryCache = /* @__PURE__ */ new Map();
function cacheKey(setCode, number, name) {
  return `${setCode.toUpperCase()}|${number}|${name.trim().toLowerCase()}`;
}
function numberVariants(number) {
  const trimmed = number.trim();
  const variants = /* @__PURE__ */ new Set([trimmed]);
  const unpadded = trimmed.replace(/^0+/, "") || "0";
  variants.add(unpadded);
  variants.add(unpadded.padStart(3, "0"));
  return [...variants];
}
function tcgdxCategoryToDeck(category) {
  if (!category) return null;
  const c = category.toLowerCase();
  if (c === "pokemon" || c === "pok\xE9mon") return "pokemon";
  if (c === "trainer") return "trainer";
  if (c === "energy") return "energy";
  return null;
}
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function localIdsMatch(a, b) {
  const na = a.replace(/^0+/, "") || "0";
  const nb = b.replace(/^0+/, "") || "0";
  return na === nb;
}
function pickBestMatch(results, tcgdexSetId, number, name) {
  const normalizedName = name.trim().toLowerCase();
  const bySetAndNumber = results.filter(
    (r) => r.id.startsWith(`${tcgdexSetId}-`) && numberVariants(number).some((v) => localIdsMatch(r.localId, v))
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
async function lookupCardMeta(setCode, number, name) {
  const key = cacheKey(setCode, number, name);
  const cached = categoryCache.get(key);
  if (cached) return cached;
  const tcgdexSetId = limitlessSetToTcgdex(setCode);
  let resolved = { category: null, regulationMark: null };
  if (tcgdexSetId) {
    for (const num of numberVariants(number)) {
      const direct = await fetchJson(
        `${TCGDEX_BASE}/cards/${tcgdexSetId}-${num}`
      );
      if (direct?.category || direct?.regulationMark) {
        resolved = {
          category: tcgdxCategoryToDeck(direct.category),
          regulationMark: direct.regulationMark?.trim().toUpperCase() || null
        };
        if (resolved.category) break;
      }
    }
  }
  if (!resolved.category) {
    const searchUrl = `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name.trim())}`;
    const results = await fetchJson(searchUrl);
    if (results?.length) {
      const match = tcgdexSetId != null ? pickBestMatch(results, tcgdexSetId, number, name) : results.find(
        (r) => r.name.trim().toLowerCase() === name.trim().toLowerCase()
      ) ?? null;
      if (match) {
        const full = await fetchJson(
          `${TCGDEX_BASE}/cards/${match.id}`
        );
        resolved = {
          category: tcgdxCategoryToDeck(full?.category) ?? resolved.category,
          regulationMark: full?.regulationMark?.trim().toUpperCase() || resolved.regulationMark
        };
      }
    }
  }
  categoryCache.set(key, resolved);
  return resolved;
}

// src/lib/pokemon/enrich-categories.ts
var BATCH_SIZE = 8;
async function enrichCards(cards) {
  const pending = cards.filter(
    (c) => (!c.sectionAssigned || !c.regulationMark) && c.setCode && c.number
  );
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (card) => {
        const looked = await lookupCardMeta(
          card.setCode,
          card.number,
          card.name
        );
        if (looked.category && !card.sectionAssigned) {
          card.category = looked.category;
        }
        if (looked.regulationMark) {
          card.regulationMark = looked.regulationMark;
        }
      })
    );
  }
}
function applyRegulation(result, allowedMarks) {
  if (!allowedMarks?.length) return result;
  const checked = checkRegulationMarks(result.cards, allowedMarks);
  result.errors.push(...checked.errors);
  result.warnings.push(...checked.warnings);
  result.isValid = result.errors.length === 0;
  return result;
}
async function parseAndEnrichPokemonDecklist(text, options) {
  const result = parsePokemonDecklist(text);
  if (!hasStructuredDeckSections(text)) {
    await enrichCards(result.cards);
    result.categories = mergeCategoryCards(result.cards);
  } else if (options?.allowedRegulationMarks?.length) {
    await enrichCards(result.cards);
  }
  return applyRegulation(result, options?.allowedRegulationMarks);
}
export {
  parseAndEnrichPokemonDecklist
};
