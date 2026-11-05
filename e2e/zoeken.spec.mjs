import { test, expect } from "@playwright/test";

for (const [naam, breedte, hoogte] of [["mobiel", 390, 844], ["desktop", 1280, 800]]) test(`zoekknop is vast, groot genoeg en botst niet met de deelknop (${naam})`, async ({ page }) => {
  await page.setViewportSize({ width: breedte, height: hoogte });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const knop = page.getByRole("button", { name: "Zoeken", exact: true });
  expect(await knop.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  const vak = await knop.boundingBox();
  expect(vak.width).toBeGreaterThanOrEqual(44);
  expect(vak.height).toBeGreaterThanOrEqual(44);
  await page.locator(".nc-title a").first().click();
  const deel = page.getByRole("button", { name: "Deel dit bericht" });
  await expect(deel).toBeVisible();
  const dv = await deel.boundingBox();
  const snijdt = vak.x < dv.x + dv.width && dv.x < vak.x + vak.width && vak.y < dv.y + dv.height && dv.y < vak.y + vak.height;
  expect(snijdt).toBe(false);
});

test("zoeken op een smal scherm zonder extra verzoeken of opslag", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const opslag = await page.evaluate(() => ({ ...localStorage }));
  const verzoeken = [];
  page.on("request", (request) => { if (["fetch", "xhr"].includes(request.resourceType())) verzoeken.push(request.url()); });
  const knop = page.getByRole("button", { name: "Zoeken", exact: true });
  await expect(knop.locator("svg")).toHaveCount(1);
  expect((await knop.textContent()).trim()).toBe("");
  await expect(page.getByText("Zoek", { exact: true })).toHaveCount(0);
  const vak = await knop.boundingBox();
  expect(vak.width).toBeGreaterThanOrEqual(44);
  expect(vak.height).toBeGreaterThanOrEqual(44);
  await knop.click();
  const invoer = page.getByRole("searchbox", { name: "Zoek in het nieuws" });
  await expect(invoer).toBeFocused();
  expect(await invoer.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await invoer.fill("onvindbarezoekterm506");
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "0 resultaten" })).toBeAttached();
  await expect(page.getByText("Geen berichten gevonden voor", { exact: false })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await invoer.press("Escape");
  await expect(invoer).toBeHidden();
  await expect(knop).toBeFocused();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(opslag);
  expect(verzoeken).toEqual([]);
});

for (const [naam, breedte, hoogte] of [["mobiel", 390, 844], ["mobiel klein", 360, 740], ["desktop", 1280, 800]]) test(`zoekknop dekt geen kaartactie of open-knop af, ook niet bij de laatste kaart (${naam})`, async ({ page }) => {
  await page.setViewportSize({ width: breedte, height: hoogte });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const knop = page.getByRole("button", { name: "Zoeken", exact: true });
  const controle = async () => {
    const vak = await knop.boundingBox();
    const dozen = await page.evaluate(() => [...document.querySelectorAll(".nc .nc-act a, .nc .nc-act .btn, .nc-title a, .nc-end a")].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }).filter((r) => r.width > 0 && r.y < innerHeight && r.y + r.height > 0));
    for (const d of dozen) expect(vak.x < d.x + d.width && d.x < vak.x + vak.width && vak.y < d.y + d.height && d.y < vak.y + vak.height).toBe(false);
    return dozen.length;
  };
  let gezien = await controle();
  const aantal = await page.locator(".nf .nc").count();
  for (let k = 0; k < aantal; k++) {
    await page.evaluate((n) => { const f = document.querySelector(".nf"); f.scrollTo({ top: f.querySelectorAll(".nc")[n].offsetTop, behavior: "instant" }); }, k);
    await page.waitForTimeout(50);
    gezien += await controle();
  }
  await page.evaluate(() => { const f = document.querySelector(".nf"); f.scrollTo({ top: f.scrollHeight, behavior: "instant" }); });
  await page.waitForTimeout(50);
  gezien += await controle();
  expect(gezien).toBeGreaterThan(0);
});

test("zoekknop schaalt niet bij :active met reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.goto("#/");
  const knop = page.getByRole("button", { name: "Zoeken", exact: true });
  await expect(knop).toBeVisible();
  const vak = await knop.boundingBox();
  await page.mouse.move(vak.x + vak.width / 2, vak.y + vak.height / 2);
  await page.mouse.down();
  const stijl = await knop.evaluate((el) => ({ t: getComputedStyle(el).transform, d: getComputedStyle(el).transitionDuration, actief: el.matches(":active") }));
  await page.mouse.up();
  expect(stijl.actief).toBe(true);
  expect(stijl.t).toBe("none");
});
