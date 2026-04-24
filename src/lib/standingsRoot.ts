/** Misma app Next: API y front comparten origen (antes Vite + Express en otro puerto). */
export function getStandingsRootUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/`;
  }
  return "/";
}
