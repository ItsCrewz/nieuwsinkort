import { test, expect } from "@playwright/test";

test("fotocarrousel geeft instructie en positie bij toetsenbordbediening", async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.route("**/media/beeld/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>' }));
  await page.route("**/data.json*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.items = data.items.map((item, n) => ({ ...item, beeld: undefined, beelden: Array.from({ length: n === 0 ? 2 : 1 }, (_, k) => `https://images.nu.nl/foto-${n}-${k}.jpg`) }));
    await route.fulfill({ response, json: data });
  });
  await page.goto("#/");
  const kaarten = page.locator(".nc-in");
  const groep = kaarten.nth(0).getByRole("group", { name: "Foto's" });
  const eenFoto = kaarten.nth(1).getByRole("group", { name: "Foto's" });
  await expect(groep).toHaveAccessibleDescription("Gebruik de pijltjestoetsen links en rechts om van foto te wisselen.");
  await expect(eenFoto).not.toHaveAttribute("aria-describedby");
  await expect(kaarten.nth(1).getByText(/Gebruik de pijltjestoetsen/)).toHaveCount(0);
  const positie = kaarten.nth(0).locator('[aria-live="polite"]');
  await expect(positie).toHaveText("Foto 1 van 2");
  await groep.focus();
  await page.keyboard.press("ArrowRight");
  await expect(positie).toHaveText("Foto 2 van 2");
  await expect(groep).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(positie).toHaveText("Foto 1 van 2");
  await page.keyboard.press("Tab");
  await expect(kaarten.nth(0).getByRole("button", { name: "Vorige foto" })).toBeFocused();
});
