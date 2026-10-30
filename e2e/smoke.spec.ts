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
    await expect(page.getByLabel(/Buscar productos/i).first()).toBeVisible();
  });

  test("búsqueda del header lleva al catálogo", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("search").getByLabel(/Buscar productos/i);
    await search.fill("pokemon");
    await page.getByRole("search").getByRole("button", { name: /Buscar/i }).click();
    await expect(page).toHaveURL(/\/catalogo/);
    await expect(page).toHaveURL(/q=pokemon/);
  });

  test("login y registro son alcanzables", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /entrar|iniciar|login/i })).toBeVisible();
    await page.goto("/registro");
    await expect(page.locator("form").first()).toBeVisible();
  });
});
