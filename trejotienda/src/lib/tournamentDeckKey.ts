/** Debe coincidir con `deckRowKey` en tom-bridge/src/tournament-overrides.mjs */
export function deckRowKey(fileName: string, categoryCode: string, playId: string): string {
  const cc = categoryCode !== "" ? categoryCode : "_";
  return `${fileName}|${cc}|${playId}`;
}
