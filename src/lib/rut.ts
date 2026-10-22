/** Validación y formato de RUT chileno (cliente). */

export function cleanRut(raw: string): string {
  return String(raw || "")
    .replace(/[^0-9kK]/g, "")
    .toUpperCase();
}

export function formatRut(cleanOrRaw: string): string {
  const clean = cleanRut(cleanOrRaw);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

export function parseAndValidateRut(raw: string): { clean: string; formatted: string } | null {
  const clean = cleanRut(raw);
  if (clean.length < 2 || clean.length > 9) return null;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return null;
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const expected = 11 - (sum % 11);
  const expectedDv = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);
  if (dv !== expectedDv) return null;
  return { clean, formatted: formatRut(clean) };
}

/** Formatea mientras se escribe (solo dígitos + K). */
export function maskRutInput(raw: string): string {
  const clean = cleanRut(raw).slice(0, 9);
  if (clean.length <= 1) return clean;
  return formatRut(clean);
}
