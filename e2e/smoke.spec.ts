import { expect, test } from "@playwright/test";

/**
 * Smoke e2e. Requiere el sitio corriendo:
 *   npm run dev
 *   npx playwright test
 * o PLAYWRIGHT_BASE_URL=https://plasmastoretcg.cl npx playwright test
 */
test.describe("smoke tienda", () => {
  test("home y catálogo cargan", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Plasma Store/i).first()).toBeVisible();

    await page.goto("/catalogo");
    await expect(page.getByRole("heading", { name: /Plasma Store/i })).toBeVisible();
  });

  test("lupa del header abre búsqueda y va al catálogo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Buscar productos/i }).click();
    const search = page.getByLabel(/Buscar productos/i);
    await expect(search).toBeVisible();
    await search.fill("pokemon");
    await page.getByRole("button", { name: /Ver todo/i }).click();
    await expect(page).toHaveURL(/\/catalogo/);
    await expect(page).toHaveURL(/q=pokemon/);
  });

  test("login y registro son alcanzables", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /entrar|iniciar|login/i })).toBeVisible();
    await page.goto("/registro");
    await expect(page.locator("form").first()).toBeVisible();
  });

  test("invitado: catálogo → carrito reachable", async ({ page }) => {
    await page.goto("/catalogo");
    const addBtn = page.getByRole("button", { name: /agregar|añadir|al carrito/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    }
    await page.goto("/carrito");
    await expect(page.getByText(/carrito|vacío|total|producto/i).first()).toBeVisible();
  });

  test("boleta token route responde (sin sesión)", async ({ request }) => {
    // Sin token válido debe fallar limpio (no 500).
    const res = await request.get("/api/store/orders/1/boleta?t=invalid");
    expect(res.status()).toBeLessThan(500);
  });

  test("ayuda y checkout page shell", async ({ page }) => {
    await page.goto("/ayuda");
    await expect(page.getByText(/ayuda|cómo comprar|compra/i).first()).toBeVisible();
    await page.goto("/checkout");
    await expect(page.locator("body")).toBeVisible();
  });
});
