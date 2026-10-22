import type { ParsedDeckCard, PokemonDeckParseResult } from "./deckParser";
import {
  hasStructuredDeckSections,
  mergeCategoryCards,
  parsePokemonDecklist,
} from "./deckParser";
import { checkRegulationMarks } from "./regulation";
import { lookupCardMeta } from "./tcgdex";

const BATCH_SIZE = 8;

async function enrichCards(cards: ParsedDeckCard[]): Promise<void> {
  const pending = cards.filter(
    (c) => (!c.sectionAssigned || !c.regulationMark) && c.setCode && c.number
  );

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (card) => {
        const looked = await lookupCardMeta(
          card.setCode!,
          card.number!,
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

function applyRegulation(
  result: PokemonDeckParseResult,
  allowedMarks?: string[]
): PokemonDeckParseResult {
  if (!allowedMarks?.length) return result;
  const checked = checkRegulationMarks(result.cards, allowedMarks);
  result.errors.push(...checked.errors);
  result.warnings.push(...checked.warnings);
  result.isValid = result.errors.length === 0;
  return result;
}

/**
 * Parsea un mazo y enriquece categorías/regulación con TCGdex.
 */
export async function parseAndEnrichPokemonDecklist(
  text: string,
  options?: { allowedRegulationMarks?: string[] }
): Promise<PokemonDeckParseResult> {
  const result = parsePokemonDecklist(text);

  if (!hasStructuredDeckSections(text)) {
    await enrichCards(result.cards);
    result.categories = mergeCategoryCards(result.cards);
  } else if (options?.allowedRegulationMarks?.length) {
    await enrichCards(result.cards);
  }

  return applyRegulation(result, options?.allowedRegulationMarks);
}
