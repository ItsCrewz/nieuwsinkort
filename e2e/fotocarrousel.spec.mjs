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
