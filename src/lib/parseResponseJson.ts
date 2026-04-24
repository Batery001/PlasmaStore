/**
 * Evita JSON.parse sobre HTML (p. ej. index.html del SPA cuando /api no llega a tom-bridge).
 */
export async function parseResponseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      "Respuesta vacía del servidor. Arranca tom-bridge (puerto 3847) o abre la tienda en http://localhost:3847/tienda/"
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const html = text.trim().startsWith("<");
    const hint = html
      ? "El servidor devolvió HTML en lugar de JSON (típico si usas solo Vite sin tom-bridge, o «vite preview» sin proxy)."
      : `La respuesta no es JSON válido (HTTP ${res.status}).`;
    throw new Error(
      `${hint} Usa la tienda en http://localhost:3847/tienda/ con tom-bridge en marcha, o en desarrollo: npm run dev en trejotienda Y tom-bridge a la vez.`
    );
  }
}
