import { test, expect } from "@playwright/test";

// Beweging (#536): kaart-entree in de feed. De LCP-kaart (eerste kaart / briefing-kop) animeert nooit; reduced motion zet alles uit.
// Fixture-data, externe verzoeken geblokkeerd. Lokaal zonder Playwright-chromium: PW_CHROME=/usr/bin/google-chrome.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "alleen het chromium-project"); });
test.use({ viewport: { width: 390, height: 844 }, launchOptions: { executablePath: process.env.PW_CHROME || undefined, args: ["--no-sandbox"] } });

const blokkeer = (page) => page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort("blockedbyclient"));
const kaartAnimaties = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.animationName === "kaart-in").length);
const traag = (page) => page.evaluate(() => document.getAnimations().filter((a) => (a.effect?.getTiming().duration ?? 0) > 0.01 && a.playState === "running").map((a) => a.animationName || a.transitionProperty));

async function naarKaart(page, n) {
  await page.evaluate((k) => { const f = document.querySelector(".nf"); f.scrollTo({ top: f.querySelectorAll(".nc")[k].offsetTop, behavior: "instant" }); }, n);
}

test("home: briefing-kop (LCP) en eerste kaart krijgen nooit wacht/entree", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  // elders in de kop (weerblok) mag de bestaande intro lopen; alleen de briefing-tekst zelf niet
  const kop = await page.evaluate(() => {
    const h = document.querySelector(".nc-head");
    const p = document.querySelector("p.brief-text");
    return { klasse: h.className, anim: h.getAnimations({ subtree: true }).filter((a) => !p || a.effect.target.contains(p)).length, op: p ? getComputedStyle(p).opacity : "1" };
  });
  expect(kop.klasse).not.toMatch(/wacht|\bin\b/);
  expect(kop.anim).toBe(0);
  expect(kop.op).toBe("1");
});

test("rubriek met kompakte kop: eerste kaart direct zichtbaar, zonder wacht", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/tech");
  await expect(page.locator(".nc-head.kompakt")).toBeVisible();
  const eerste = await page.evaluate(() => {
    const c = document.querySelector(".nc");
    const kids = [...c.querySelectorAll(".nc-body > *")];
    return { klasse: c.className, ops: kids.map((k) => getComputedStyle(k).opacity), anim: c.getAnimations({ subtree: true }).length };
  });
  expect(eerste.klasse).not.toMatch(/wacht|\bin\b/);
  expect(eerste.anim).toBe(0);
  expect(eerste.ops.length).toBeGreaterThan(0);
  expect(eerste.ops.every((o) => o === "1")).toBe(true);
});

test("kaart 3: entree speelt één keer af, niet opnieuw bij terugscrollen", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/tech");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await expect(page.locator(".nc").nth(2)).toHaveClass(/wacht/);
  await naarKaart(page, 2);
  await expect(page.locator(".nc").nth(2)).toHaveClass(/\bin\b/);
  expect(await kaartAnimaties(page)).toBeGreaterThan(0);
  await expect.poll(() => kaartAnimaties(page), { timeout: 2000 }).toBe(0); // <= 330 ms plus marge
  const op = await page.evaluate(() => [...document.querySelectorAll(".nc")[2].querySelectorAll(".nc-body > *")].map((k) => getComputedStyle(k).opacity));
  expect(op.every((o) => o === "1")).toBe(true);
  await naarKaart(page, 0);
  await naarKaart(page, 2);
  await page.waitForTimeout(100);
  expect(await kaartAnimaties(page)).toBe(0);
});

test("licht en donker: entree werkt, kaart blijft zichtbaar", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/tech");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await naarKaart(page, 2);
  await expect(page.locator(".nc").nth(2)).toHaveClass(/\bin\b/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelectorAll(".nc .nc-title")[2]).opacity)).toBe("1");
});

test("reduced motion: geen wacht/in, geen lopende animaties, functie gelijk", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blokkeer(page);
  await page.goto("#/tech");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  expect(await page.locator(".nc.wacht, .nc.in").count()).toBe(0);
  await naarKaart(page, 2);
  await page.waitForTimeout(150);
  expect(await page.locator(".nc.wacht, .nc.in").count()).toBe(0);
  expect(await traag(page)).toEqual([]);
  const titel = await page.evaluate(() => getComputedStyle(document.querySelectorAll(".nc .nc-title")[2]).opacity);
  expect(titel).toBe("1");
  // tokens en transities staan op (bijna) nul, ook buiten .app
  const dur = await page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue("--dur-3").trim(), getComputedStyle(document.body).transitionDuration]);
  expect(dur[0]).toBe(".01ms");
  expect(parseFloat(dur[1])).toBeLessThanOrEqual(0.00001);
  // toetsenbord blijft werken
  await page.keyboard.press("k");
});

test("terug uit een artikel: doelkaart speelt de entree niet opnieuw", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/tech");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await naarKaart(page, 2);
  await expect(page.locator(".nc").nth(2)).toHaveClass(/\bin\b/);
  const id = await page.locator(".nc").nth(2).getAttribute("data-id");
  await page.locator(".nc").nth(2).locator(".nc-title a").click();
  await expect(page.locator("article.detail")).toBeVisible();
  await page.goBack();
  const kaart = page.locator(`.nc[data-id="${id}"]`);
  await expect(kaart).toBeVisible();
  await expect(kaart).not.toHaveClass(/wacht|\bin\b/);
  expect(await kaartAnimaties(page)).toBe(0);
});

// Trek-om-te-verversen (#540): echte aanraakgebeurtenissen via CDP; één /data.json per trek, status zichtbaar, reduced motion zonder animatie.
async function trek(page, dy, stappen = 10) {
  const cdp = await page.context().newCDPSession(page);
  const x = 195, y0 = 200;
  const stuur = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await stuur("touchStart", y0);
  for (let i = 1; i <= stappen; i++) await stuur("touchMove", y0 + (dy * i) / stappen);
  return { los: () => stuur("touchEnd", y0 + dy) };
}
const dataVerzoeken = (page) => { const l = []; page.on("request", (r) => { if (/\/data\.json/.test(r.url())) l.push(r.url()); }); return l; };

test("trek-om-te-verversen: boven de drempel precies één /data.json en een status; erdoor geen tweede binnen 30 s", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const l = dataVerzoeken(page);
  let g = await trek(page, 300);
  await g.los();
  await expect(page.locator(".ptr-t")).toHaveText(/Bijgewerkt om \d\d:\d\d|Je bent bij|Verversen/);
  await expect.poll(() => l.length).toBe(1);
  await expect(page.locator(".ptr-t")).toHaveCount(0, { timeout: 4000 });
  g = await trek(page, 300);
  await g.los();
  await expect(page.locator(".ptr-t")).toHaveText("Je bent bij");
  expect(l.length).toBe(1);
});

test("trek-om-te-verversen: onder de drempel geen verzoek", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const l = dataVerzoeken(page);
  const g = await trek(page, 60);
  await g.los();
  await page.waitForTimeout(400);
  expect(l.length).toBe(0);
});

test("trek-om-te-verversen: reduced motion toont statisch 'Loslaten om te verversen' zonder lopende animatie", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blokkeer(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const g = await trek(page, 300);
  await expect(page.locator(".ptr-t")).toHaveText("Loslaten om te verversen");
  expect(await traag(page)).toEqual([]);
  await g.los();
});
