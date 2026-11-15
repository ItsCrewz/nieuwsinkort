import { test, expect } from "@playwright/test";

// Vaste data: twee shorts, twee journaals en twee Dumpert-items, zodat de tablijst altijd bestaat.
const yt = (id, titel, soort) => ({ titel, bron: "YouTube", href: `https://www.youtube.com/watch?v=${id}`, embed: `https://www.youtube-nocookie.com/embed/${id}`, ai: "Korte uitleg.", thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, populariteit: "1k views", tijd: "12:00", soort, t: Date.now() - 60e3 });
const dumpert = (n) => ({ titel: `Dumpert ${n}`, bron: "Dumpert", href: `https://www.dumpert.nl/item/${n}_abcdef12`, ai: "Korte uitleg.", thumb: "https://media.dumpert.nl/p.jpg", populariteit: "1 views", embed: `https://media.dumpert.nl/dmp/media/video/${n}/index.m3u8`, tijd: "12:00", t: Date.now() - 60e3 });

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.route("**/data.json*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.filmpjes = [
      yt("aaaaaaaaaa1", "Short een", "short"),
      yt("aaaaaaaaaa2", "Short twee", "short"),
      yt("bbbbbbbbbb1", "Journaal een", "journaal"),
      yt("bbbbbbbbbb2", "Journaal twee", "journaal"),
    ];
    data.dumpert = [dumpert(1), dumpert(2)];
    data.gegenereerd = new Date().toISOString();
    data.samenvattingen = {};
    await route.fulfill({ response, json: data });
  });
});

test("filmpjespaneel verwijst naar het gekozen tabblad", async ({ page }) => {
  await page.goto("/#/filmpjes");
  const tabs = page.getByRole("tablist", { name: "Soort filmpjes" }).getByRole("tab");
  await expect(tabs).toHaveCount(2);
  const paneel = page.locator("#video-paneel");
  for (let i = 0; i < 2; i++) {
    await tabs.nth(i).click();
    const id = await tabs.nth(i).getAttribute("id");
    expect(id).toMatch(/^video-tab-/);
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1 - i)).toHaveAttribute("aria-selected", "false");
    await expect(paneel).toHaveAttribute("role", "tabpanel");
    await expect(paneel).toHaveAttribute("aria-labelledby", id);
  }
});

test("pijltoetsen wisselen van tabblad en het paneel volgt", async ({ page }) => {
  await page.goto("/#/filmpjes");
  const tabs = page.getByRole("tablist", { name: "Soort filmpjes" }).getByRole("tab");
  await expect(tabs).toHaveCount(2);
  const paneel = page.locator("#video-paneel");
  await tabs.first().click();
  await expect(tabs.first()).toBeFocused();
  const eerste = await tabs.first().getAttribute("id");
  const tweede = await tabs.nth(1).getAttribute("id");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(paneel).toHaveAttribute("aria-labelledby", tweede);
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.first()).toBeFocused();
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(paneel).toHaveAttribute("aria-labelledby", eerste);
});

test("Dumpert heeft geen los tabpanel", async ({ page }) => {
  await page.goto("/#/dumpert");
  await expect(page.getByText("Dumpert 1").first()).toBeVisible();
  await expect(page.locator("#video-paneel")).toBeAttached();
  await expect(page.getByRole("tablist", { name: "Soort filmpjes" })).toHaveCount(0);
  await expect(page.locator("#video-paneel[role=tabpanel]")).toHaveCount(0);
  await expect(page.locator("#video-paneel[aria-labelledby]")).toHaveCount(0);
});
