export function formatCLP(cents: number) {
  const v = cents / 100;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(
    v
  );
}
