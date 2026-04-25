/** URL pública de imagen de producto (ruta absoluta en el mismo origen o URL externa). */
export function resolveStoreMediaUrl(url: string | null | undefined): string | undefined {
  if (url == null || String(url).trim() === "") return undefined;
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  /** En Vercel los uploads van en memoria y se persisten como data URL en Mongo; no anteponer "/". */
  if (/^data:/i.test(u)) return u;
  if (/^blob:/i.test(u)) return u;
  return u.startsWith("/") ? u : `/${u}`;
}
