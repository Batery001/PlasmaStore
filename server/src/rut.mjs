/**
 * Validación y normalización de RUT chileno.
 * Guardamos `rut_normalized` (ej. 12345678K) para unicidad.
 */

export function cleanRut(raw) {
  return String(raw || "")
    .replace(/[^0-9kK]/g, "")
    .toUpperCase();
}

export function formatRut(cleanOrRaw) {
  const clean = cleanRut(cleanOrRaw);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

/**
 * @param {unknown} raw
 * @returns {{ clean: string, formatted: string } | null}
 */
export function parseAndValidateRut(raw) {
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

/**
 * @param {unknown} raw
 * @param {{ required?: boolean }} [opts]
 */
export function assertValidRut(raw, opts = {}) {
  const required = opts.required !== false;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    if (required) throw Object.assign(new Error("Indica tu RUT."), { status: 400 });
    return null;
  }
  const parsed = parseAndValidateRut(trimmed);
  if (!parsed) throw Object.assign(new Error("RUT inválido. Usa el formato 12.345.678-9."), { status: 400 });
  return parsed;
}
