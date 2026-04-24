export function parseTournamentDateString(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  // TOM suele traer m/d/yyyy
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (m) {
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const d = new Date(year, month, day);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const t = Date.parse(trimmed);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

