export type DeckGame = "pokemon" | "mitos-y-leyendas";

export function normalizeDeckGame(raw: unknown): DeckGame {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "mitos-y-leyendas" || s === "myl" || s === "mitos" || s.includes("mito")) {
    return "mitos-y-leyendas";
  }
  return "pokemon";
}

export function deckGameLabel(game: DeckGame) {
  return game === "mitos-y-leyendas" ? "Mitos y Leyendas" : "Pokémon";
}
