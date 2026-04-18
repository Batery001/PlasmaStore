/**
 * Formatea montos en pesos chilenos (enteros).
 * Nota: en la API el campo sigue llamándose `price_cents` por compatibilidad, pero almacena **pesos CLP** enteros.
 */
export function formatCLP(pesos: number) {
  const n = Math.round(Number(pesos) || 0);
  const formatted = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
  return `${formatted} CLP`;
}
