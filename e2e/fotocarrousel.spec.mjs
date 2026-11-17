import { test, expect } from "@playwright/test";
import fixture from "../tests/regressie/fixtures/fotocarrousel-721.json" with { type: "json" };

test("fotocarrousel bewaart de zichtbare foto bij nieuwe berichtdata", async ({ page }) => {
  await page.route("**/foto-*.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"/>' }));
  await page.goto("/");
  await page.evaluate(async (urls) => {
    const React = await import("/node_modules/.vite/deps/react.js");
    const { createRoot } = await import("/node_modules/.vite/deps/react-dom_client.js");
    const { Beelden } = await import("/src/beelden.tsx");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;z-index:9999;background:white";
    document.body.append(host);
    const root = createRoot(host);
    window.toonFotos = (urls) => root.render(React.createElement(Beelden, { urls }));
    window.toonFotos(urls);
  }, fixture.oorspronkelijk);
  const track = page.locator(".bl-track").last();
  const controleer = async (index, aantal) => {
    await expect.poll(() => track.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth))).toBe(index);
    await expect(track.locator(".bl-slide:not([aria-hidden])")).toHaveCount(1);
    await expect(track.locator(".bl-slide").nth(index)).not.toHaveAttribute("aria-hidden", "true");
    if (aantal > 1) await expect(page.locator(".bl .sr-only").last()).toHaveText(`Foto ${index + 1} van ${aantal}`);
  };
  await track.focus();
  await page.keyboard.press("ArrowRight");
  await controleer(1, 3);
  await page.evaluate((urls) => window.toonFotos(urls), fixture.gewijzigd);
  await controleer(2, 3);
  await page.evaluate((urls) => window.toonFotos(urls), fixture.verwijderd);
  await controleer(0, 2);
  await track.evaluate((el) => { el.scrollLeft = el.clientWidth; });
  await controleer(1, 2);
  await page.evaluate((urls) => window.toonFotos(urls), fixture.een);
  await controleer(0, 1);
});

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
  const eenFoto = kaarten.nth(1).locator(".bl-track");
  await expect(kaarten.nth(1).getByRole("group", { name: "Foto's" })).toHaveCount(0);
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
