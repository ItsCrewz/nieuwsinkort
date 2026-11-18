import { test, expect } from "@playwright/test";
import { build } from "esbuild";

const bundel = await build({ entryPoints: ["tests/regressie/fixtures/1210-voorlaadrichting.tsx"], bundle: true, format: "iife", write: false });

test("alleen de nieuwslijst bepaalt de voorlaadrichting", async ({ page }) => {
  await page.goto("about:blank");
  await page.setContent('<style>.nf{height:200px;overflow:auto}.kaart{height:200px}.bl-track{display:flex;width:100px;overflow:auto}.bl-slide{flex:0 0 100px}</style><div id="root"></div>');
  await page.evaluate(() => {
    window.verzoeken = [];
    window.waarnemers = [];
    window.IntersectionObserver = class {
      constructor(cb, opties) { this.cb = cb; this.opties = opties; this.els = []; window.waarnemers.push(this); }
      observe(el) { this.els.push(el); }
      unobserve() {}
      disconnect() {}
    };
    window.Image = class {
      set src(url) { if (url) window.verzoeken.push(url); }
      decode() { return Promise.resolve(); }
    };
    window.zetZichtbaar = (index) => {
      const io = window.waarnemers.find((w) => w.opties?.threshold === 0.01);
      io.cb(io.els.map((el, i) => ({ target: el, isIntersecting: i === index })));
    };
  });
  await page.addScriptTag({ content: bundel.outputFiles[0].text });
  await expect(page.locator(".bl-track")).toHaveCount(12);
  const zichtbaar = async (index) => { await page.evaluate((i) => window.zetZichtbaar(i), index); await page.waitForTimeout(100); };
  const geladen = async (index) => page.evaluate((i) => window.verzoeken.some((url) => decodeURIComponent(url).includes(`/${i}.svg`)), index);
  await zichtbaar(4);
  await expect.poll(() => geladen(7)).toBe(true);
  await page.locator(".nf").evaluate((el) => { el.scrollTop = 400; el.dispatchEvent(new Event("scroll")); });
  await page.locator(".nf").evaluate((el) => { el.scrollTop = 200; el.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => geladen(1)).toBe(true);
  // Een andere scroller beweegt verticaal terwijl de foto horizontaal wordt verschoven.
  await page.locator(".bl-track").nth(4).evaluate((el) => {
    Object.defineProperty(el, "scrollTop", { configurable: true, value: 0, writable: true });
    el.dispatchEvent(new Event("scroll"));
    el.scrollTop = 100; el.scrollLeft = 100; el.dispatchEvent(new Event("scroll"));
  });
  await zichtbaar(8);
  await expect.poll(() => geladen(5)).toBe(true);
  expect(await geladen(11)).toBe(false);
  await page.locator(".nf").evaluate((el) => { el.scrollTop = 600; el.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => geladen(11)).toBe(true);
});
