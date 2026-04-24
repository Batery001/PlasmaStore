/** Raíz del servidor donde está el panel de standings (preview-standings), no bajo /tienda/. */
export function getStandingsRootUrl(): string {
  if (import.meta.env.DEV) {
    const h = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
    return `http://${h}:3847/`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/`;
  }
  return "/";
}
