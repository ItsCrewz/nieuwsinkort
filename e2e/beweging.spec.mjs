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

test("thema-icoon wisselt en reduced motion laat niets lopen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blokkeer(page);
  await page.goto("#/");
  const knop = page.locator(".topbar .iconbtn").last();
  const voor = await page.evaluate(() => document.documentElement.dataset.theme);
  await knop.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(voor);
  expect(await traag(page)).toEqual([]);
});

// Thema (#539): werkt met en zonder View Transitions-API, meta theme-color wisselt mee, geen flits.
const themaStaat = (page) => page.evaluate(() => ({
  thema: document.documentElement.dataset.theme,
  meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")),
  bg: getComputedStyle(document.body).backgroundColor,
}));

for (const vt of ["zonder View Transitions-API", "met View Transitions-API"]) {
  test(`thema wisselen ${vt}: theme-color mee, direct nieuwe achtergrond`, async ({ page }) => {
    if (vt.startsWith("zonder")) await page.addInitScript(() => { Object.defineProperty(Document.prototype, "startViewTransition", { value: undefined, configurable: true }); });
    await blokkeer(page);
    await page.goto("#/");
    await expect(page.locator(".topbar .iconbtn").last()).toBeVisible();
    if (!vt.startsWith("zonder")) expect(await page.evaluate(() => typeof document.startViewTransition)).toBe("function");
    else expect(await page.evaluate(() => typeof document.startViewTransition)).toBe("undefined");
    const voor = await themaStaat(page);
    const verwacht = voor.thema === "dark" ? "light" : "dark";
    const kleur = verwacht === "dark" ? "#0f0f0f" : "#ffffff";
    // direct na de klik (zelfde taak) lezen: geen tussenstand met de oude achtergrond
    const na = await page.evaluate(() => {
      const knop = [...document.querySelectorAll(".topbar .iconbtn")].pop();
      knop.click();
      return new Promise((r) => requestAnimationFrame(() => r({
        thema: document.documentElement.dataset.theme,
        meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")),
        bg: getComputedStyle(document.body).backgroundColor,
      })));
    });
    expect(na.thema).toBe(verwacht);
    expect(na.meta.every((c) => c === kleur)).toBe(true);
    expect(na.bg).not.toBe(voor.bg);
    expect(await themaStaat(page)).toEqual(na); // blijft staan, geen terugval
  });
}

test("licht en donker thema blijven leesbaar met Focus-lezen aan", async ({ page }) => {
  await blokkeer(page);
  await page.addInitScript(() => { localStorage.setItem("nieuwsinkort-thema", "light"); });
  await page.goto("#/");
  const focus = page.getByRole("switch", { name: "Focus-lezen" });
  await focus.click();
  await expect(focus).toHaveAttribute("aria-checked", "true");
  const tekst = page.locator(".nc .bn b").first();
  await expect(tekst).toBeVisible();
  const licht = await tekst.evaluate((el) => getComputedStyle(el).color);
  await page.getByRole("button", { name: "Schakel naar donkere modus" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(focus).toHaveAttribute("aria-checked", "true");
  await expect(tekst).toBeVisible();
  expect(await tekst.evaluate((el) => getComputedStyle(el).color)).not.toBe(licht);
  await page.getByRole("button", { name: "Schakel naar lichte modus" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(focus).toHaveAttribute("aria-checked", "true");
  expect(await tekst.evaluate((el) => getComputedStyle(el).color)).toBe(licht);
});

test("rubriekwissel: paneel animeert ≤ 240 ms, nooit gestapeld; briefing zonder animatie", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  expect(await page.evaluate(() => document.querySelector("p.brief-text")?.getAnimations().length ?? 0)).toBe(0);
  const tabs = page.locator('[role="tab"]');
  for (const [tab, richting] of [[1, 1], [2, 1], [1, -1]]) {
    await tabs.nth(tab).click();
    // Route (hashchange) loopt async: pas meten als de tab echt actief is, anders lees je de vorige animatie.
    await expect(tabs.nth(tab)).toHaveAttribute("aria-selected", "true");
    const animaties = await page.evaluate(() => document.getElementById("rubriek-paneel").getAnimations()
      .filter((a) => a.playState === "running" || a.playState === "pending")
      .map((a) => ({ duur: a.effect.getTiming().duration, x: new DOMMatrix(a.effect.getKeyframes()[0].transform).m41 })));
    expect(animaties).toHaveLength(1);
    expect(animaties[0].duur).toBeGreaterThan(0);
    expect(animaties[0].duur).toBeLessThanOrEqual(240);
    expect(animaties[0].x * richting).toBeGreaterThan(0);
  }
});

test("reduced motion: geen lopende animaties bij rubriekwissel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blokkeer(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const tabs = page.locator('[role="tab"]');
  for (const tab of [1, 0]) {
    await tabs.nth(tab).click();
    expect(await page.evaluate(() => document.getElementById("rubriek-paneel").getAnimations().length)).toBe(0);
    expect(await traag(page)).toEqual([]);
  }
});

// Micro-interacties (#539) die in de PR zitten: tikfeedback scale(.97), transform-transitie op knoppen, zon/maan-icoon dat draait.
// Geschrapt voor het CSS-budget (dus niet getest): richting-animatie teller, pop van de bronnen-badge, fade van de deel-toast, pop van het deel-vinkje.
const micro = (page) => page.evaluate(() => {
  const cs = (el) => getComputedStyle(el);
  const knop = document.querySelector(".topbar .iconbtn:last-child");
  const src = document.querySelector(".topbar .srcbtn");
  const icoon = [...knop.querySelectorAll(".ti .ic")].map((i) => ({ aan: i.classList.contains("aan"), op: cs(i).opacity, tr: cs(i).transitionDuration }));
  return {
    knopTransitie: [cs(knop).transitionProperty, cs(knop).transitionDuration],
    srcTransitie: [cs(src).transitionProperty, cs(src).transitionDuration],
    icoon,
  };
});
const tikStand = async (page, loc) => {
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  // de transform-transitie (--dur-2) loopt nog: wacht tot de eindstand
  await expect.poll(() => loc.evaluate((el) => getComputedStyle(el).transform), { timeout: 2000 }).toMatch(/^matrix\(0\.97,/);
  const t = await loc.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(2, 2); // weg van de knop vóór loslaten: geen klik
  await page.mouse.up();
  return t;
};

for (const thema of ["light", "dark"]) {
  test(`micro-interacties in ${thema} thema met Focus lezen aan`, async ({ page }) => {
    await blokkeer(page);
    await page.addInitScript((t) => { localStorage.setItem("nieuwsinkort-thema", t); }, thema);
    await page.goto("#/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", thema);
    const focus = page.getByRole("switch", { name: "Focus-lezen" });
    await focus.click();
    await expect(focus).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".nc .bn b").first()).toBeVisible();
    const m = await micro(page);
    // knoppen: transform-transitie met echte duur; icoon: precies één zichtbaar (zon bij donker, maan bij licht)
    for (const [prop, dur] of [m.knopTransitie, m.srcTransitie]) { expect(prop).toMatch(/transform|all/); expect(parseFloat(dur)).toBeGreaterThan(0); }
    expect(m.icoon).toHaveLength(2);
    expect(m.icoon.every((i) => parseFloat(i.tr) > 0)).toBe(true);
    expect(m.icoon.filter((i) => i.aan)).toHaveLength(1);
    expect(m.icoon.map((i) => i.op).sort()).toEqual(["0", "1"]);
    // tikfeedback: scale(.97) tijdens ingedrukt
    const stand = await tikStand(page, page.locator(".topbar .srcbtn"));
    expect(parseFloat(stand.match(/^matrix\(([^,]+)/)?.[1])).toBeCloseTo(0.97, 2);
    // thema-icoon draait mee en blijft leesbaar met Focus lezen aan
    await page.locator(".topbar .iconbtn").last().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", thema === "dark" ? "light" : "dark");
    await expect(focus).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await micro(page)).icoon.map((i) => i.op).sort().join()).toBe("0,1");
    expect((await micro(page)).icoon.filter((i) => i.aan)).toHaveLength(1);
  });

  test(`micro-interacties uit bij reduced motion in ${thema} thema met Focus lezen aan`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await blokkeer(page);
    await page.addInitScript((t) => { localStorage.setItem("nieuwsinkort-thema", t); }, thema);
    await page.goto("#/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", thema);
    const focus = page.getByRole("switch", { name: "Focus-lezen" });
    await focus.click();
    await expect(focus).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".nc .bn b").first()).toBeVisible();
    const m = await micro(page);
    for (const [, dur] of [m.knopTransitie, m.srcTransitie]) expect(parseFloat(dur)).toBeLessThanOrEqual(0.00001);
    expect(m.icoon.every((i) => parseFloat(i.tr) <= 0.00001)).toBe(true);
    await page.locator(".topbar .iconbtn").last().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", thema === "dark" ? "light" : "dark");
    expect(await traag(page)).toEqual([]);
  });
}
