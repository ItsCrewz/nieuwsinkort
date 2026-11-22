import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const media = readFileSync("tests/fixtures/stil.webm");
const nu = Date.now();
const video = (n, bron, embed) => ({ titel: `Testfilmpje ${n}`, ai: "", bron, href: bron === "YouTube" ? `https://www.youtube.com/shorts/yt${n}abcdef` : `https://www.dumpert.nl/item/${n}_abc`, embed, thumb: "", populariteit: "1 views", tijd: "12:00", soort: "short", t: nu - n * 60000 });

test("slidertoetsen wijzigen de voortgang zonder van video te wisselen (#984)", async ({ page }) => {
  // Een vaste duur en stand maken de controle onafhankelijk van de afspeelsnelheid.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const standen = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 60 });
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", { configurable: true, get() { return standen.get(this) ?? 10; }, set(t) { standen.set(this, t); } });
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => {
    if (route.request().url().startsWith("https://media.test/")) return route.fulfill({ status: 200, contentType: "video/webm", body: media });
    return route.abort("blockedbyclient");
  });
  await page.route("**/data.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ gegenereerd: new Date().toISOString(), datum: "15 november 2026", dag_samenvatting: "", weer: {}, items: [], filmpjes: [video(0, "Instagram", "https://media.test/0.mp4"), video(1, "YouTube", "https://www.youtube-nocookie.com/embed/yt1abcdef"), video(2, "Instagram", "https://media.test/2.mp4")] }) }));
  await page.goto("/#/filmpjes");
  await page.locator(".vcard-open").first().click();
  const actief = page.locator('.fslide[aria-current="true"]');
  await expect(actief).toHaveAttribute("data-i", "0");
  const slider = actief.getByRole("slider");
  await expect(slider).toHaveAttribute("tabindex", "0");
  await slider.focus();
  for (const [toets, positie, tekst] of [["ArrowUp", 15, "0:15"], ["ArrowDown", 10, "0:10"], ["End", 60, "1:00"], ["Home", 0, "0:00"], ["ArrowRight", 5, "0:05"], ["ArrowLeft", 0, "0:00"]]) {
    await page.keyboard.press(toets);
    await page.waitForTimeout(100);
    await expect(actief).toHaveAttribute("data-i", "0");
    await expect.poll(() => actief.locator("video").evaluate((v) => v.currentTime)).toBe(positie);
    await expect(slider).toHaveAttribute("aria-valuenow", String(Math.round(positie / 60 * 100)));
    await expect(slider).toHaveAttribute("aria-valuetext", `${tekst} van 1:00`);
  }
  for (const toets of ["PageUp", "PageDown"]) {
    await page.keyboard.press(toets);
    await page.waitForTimeout(100);
    await expect(actief).toHaveAttribute("data-i", "0");
  }
  // Laat de gebeurtenis ook langs de globale handler lopen, ondanks stopPropagation van Scrub.
  await page.evaluate(() => {
    window.sliderToetsen = 0;
    window.addEventListener("keydown", () => window.sliderToetsen++);
  });
  for (const [toets, positie, tekst] of [["ArrowUp", 5, "0:05"], ["ArrowDown", 0, "0:00"], ["PageUp", 0, "0:00"], ["PageDown", 0, "0:00"], ["End", 60, "1:00"], ["Home", 0, "0:00"]]) {
    const aantal = await page.evaluate(() => window.sliderToetsen);
    await slider.evaluate((el, key) => {
      const gebeurtenis = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      gebeurtenis.stopPropagation = () => {};
      el.dispatchEvent(gebeurtenis);
    }, toets);
    await expect.poll(() => page.evaluate(() => window.sliderToetsen)).toBe(aantal + 1);
    await expect(actief).toHaveAttribute("data-i", "0");
    await expect.poll(() => actief.locator("video").evaluate((v) => v.currentTime)).toBe(positie);
    await expect(slider).toHaveAttribute("aria-valuenow", String(Math.round(positie / 60 * 100)));
    await expect(slider).toHaveAttribute("aria-valuetext", `${tekst} van 1:00`);
  }
  // Een toets buiten de slider bewijst dat de globale feedhandler actief is.
  await page.locator(".fslide[aria-current=true]").evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await expect(actief).toHaveAttribute("data-i", "1");
  const nietBeschikbaar = actief.getByRole("slider");
  await expect(nietBeschikbaar).toHaveAttribute("tabindex", "-1");
  for (const toets of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]) {
    const aantal = await page.evaluate(() => window.sliderToetsen);
    await nietBeschikbaar.dispatchEvent("keydown", { key: toets, bubbles: true });
    await expect.poll(() => page.evaluate(() => window.sliderToetsen)).toBe(aantal + 1);
    await expect(actief).toHaveAttribute("data-i", "1");
  }
});
