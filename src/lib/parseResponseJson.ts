/**
 * Evita JSON.parse sobre HTML (p. ej. layout Next cuando /api no enruta al backend).
 */
export async function parseResponseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      "Respuesta vacía del servidor. Comprueba que Next esté en marcha (npm run dev) y variables como MONGODB_URI."
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const html = text.trim().startsWith("<");
    const hint = html
      ? "El servidor devolvió HTML en lugar de JSON (la petición no llegó al handler de la API)."
      : `La respuesta no es JSON válido (HTTP ${res.status}).`;
    throw new Error(
      `${hint} En local: npm run dev (http://localhost:3000) y revisa la consola del servidor.`
    );
  }
}
