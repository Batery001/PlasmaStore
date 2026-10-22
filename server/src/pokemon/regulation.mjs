// src/lib/pokemon/deckParser.ts
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

// src/lib/pokemon/regulation.ts
var REGULATION_MARKS = ["G", "H", "I", "J"];
var DEFAULT_REGULATION_MARKS = ["H", "I", "J"];
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
function normalizeRegulationMarks(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_REGULATION_MARKS];
  const allowed = new Set(REGULATION_MARKS);
  const marks = raw.map((m) => String(m).trim().toUpperCase()).filter((m) => allowed.has(m));
  return marks.length > 0 ? [...new Set(marks)] : [...DEFAULT_REGULATION_MARKS];
}
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
export {
  DEFAULT_REGULATION_MARKS,
  REGULATION_MARKS,
  SET_REGULATION_MARK,
  checkRegulationMarks,
  formatMarksList,
  normalizeRegulationMarks,
  regulationMarkForSet
};
