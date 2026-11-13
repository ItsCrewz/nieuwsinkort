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

// Micro-interacties (#539): thema-icoon, tellerschuif, badge, carrousel-dots.
const kortDuur = (page) => page.evaluate(() => document.getAnimations().filter((a) => (a.effect?.getTiming().duration ?? 0) > 0.01).map((a) => a.animationName || a.transitionProperty));

for (const [naam, vt] of [["met View Transitions", true], ["zonder View Transitions", false]]) {
  for (const focus of [false, true]) {
    test(`thema wisselen ${naam}${focus ? ", Focus lezen aan" : ""}: licht <-> donker, theme-color mee`, async ({ page }) => {
      await blokkeer(page);
      await page.addInitScript((met) => { if (!met) document.startViewTransition = undefined; localStorage.setItem("nieuwsinkort-bionic", "x"); }, vt);
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("#/");
      if (focus) await page.locator(".focus").click();
      await expect(page.locator(".nc-title a").first()).toBeVisible();
      const html = page.locator("html");
      await page.getByRole("button", { name: "Schakel naar donkere modus" }).click();
      await expect(html).toHaveAttribute("data-theme", "dark");
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#0f0f0f");
      await expect(page.locator(".iconbtn.thema .ic.on use")).toHaveAttribute("href", "#i-sun");
      await page.getByRole("button", { name: "Schakel naar lichte modus" }).click();
      await expect(html).toHaveAttribute("data-theme", "light");
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#ffffff");
      await expect(page.locator(".iconbtn.thema .ic.on use")).toHaveAttribute("href", "#i-moon");
    });
  }
}

test("reduced motion: thema, tellerschuif en badge zonder lopende animatie, functie gelijk", async ({ page }) => {
  await blokkeer(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  await page.getByRole("button", { name: "Schakel naar donkere modus" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await naarKaart(page, 2);
  await expect(page.locator(".nf-pos [aria-live] .nf-getal")).toHaveText(/^3\//);
  await page.waitForTimeout(100);
  expect(await kortDuur(page)).toEqual([]);
});

test("tellerschuif: live-region blijft behouden, binnenste getal schuift in scrollrichting", async ({ page }) => {
  await blokkeer(page);
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const live = page.locator(".nf-pos > [aria-live=polite]");
  await expect(live).toHaveCount(1);
  await live.evaluate((el) => { el.dataset.zelfde = "1"; });
  await naarKaart(page, 2);
  await expect(live.locator(".nf-getal")).toHaveClass(/\bv\b/);
  await expect(live).toContainText("3/");
  await naarKaart(page, 1);
  await expect(live.locator(".nf-getal")).toHaveClass(/\bo\b/);
  await expect(live).toContainText("2/");
  // hetzelfde DOM-element: niet opnieuw gemount, dus voorleesbaar voor schermlezers
  await expect(page.locator(".nf-pos > [aria-live=polite][data-zelfde='1']")).toHaveCount(1);
  await expect(live).toHaveAttribute("aria-live", "polite");
});

test("carrousel-dots: geen width-transition, vaste breedte, actieve stip schaalt (licht en donker)", async ({ page }, info) => {
  await page.route("**/foto-*.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#789"/></svg>' }));
  await blokkeer(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const reactMod = await import("/node_modules/.vite/deps/react.js");
    const React = reactMod.createElement ? reactMod : reactMod.default;
    const dom = await import("/node_modules/.vite/deps/react-dom_client.js");
    const createRoot = dom.createRoot ?? dom.default.createRoot;
    const { Beelden } = await import("/src/beelden.tsx");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;z-index:9999;background:var(--bg,white)";
    document.body.append(host);
    createRoot(host).render(React.createElement(Beelden, { urls: ["/foto-1.svg", "/foto-2.svg", "/foto-3.svg"] }));
  });
  const dots = page.locator(".bl-dots span");
  await expect(dots).toHaveCount(3);
  for (const thema of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), thema);
    const stip = await dots.evaluateAll((els) => els.map((e) => { const c = getComputedStyle(e); return { w: c.width, props: c.transitionProperty, op: e.classList.contains("on") }; }));
    for (const d of stip) { expect(d.w).toBe("16px"); expect(d.props).not.toMatch(/\bwidth\b|\ball\b/); }
    expect(stip.filter((d) => d.op)).toHaveLength(1);
    const tf = await dots.evaluateAll((els) => els.map((e) => getComputedStyle(e).transform));
    expect(tf[0]).toBe("none");
    expect(tf[1]).not.toBe("none");
    await page.locator(".bl").last().screenshot({ path: info.outputPath(`dots-${thema}.png`) });
  }
});
