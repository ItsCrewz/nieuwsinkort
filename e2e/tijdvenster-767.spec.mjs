import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const bron = JSON.parse(readFileSync("public/data.json", "utf8"));

test("een open pagina werkt het tijdvenster bij en behoudt de leespositie", async ({ page }) => {
  const nu = Date.parse("2026-10-28T12:00:00Z");
  await page.clock.install({ time: nu });
  await page.addInitScript(() => localStorage.setItem("nieuwsinkort-filters", JSON.stringify({ tijd: "1u", sort: "oud" })));
  const data = structuredClone(bron);
  data.gegenereerd = new Date(nu).toISOString();
  data.items = data.items.slice(0, 8).map((item, i) => ({ ...item, t: nu - 3600e3 + (i === 0 ? 10000 : 600000 + i * 1000) }));
  await page.route("**/data.json", (route) => route.fulfill({ json: data }));
  await page.goto("/#/");
  const kaarten = page.locator(".nf .nc");
  await expect(kaarten).toHaveCount(8);
  const id = await kaarten.nth(3).getAttribute("data-id");
  await kaarten.nth(3).scrollIntoViewIfNeeded();
  const positie = () => page.locator(".nf").evaluate((feed, doel) => {
    const element = [...feed.querySelectorAll(".nc")].find((el) => el.dataset.id === doel);
    return element.getBoundingClientRect().top - feed.getBoundingClientRect().top;
  }, id);
  const voor = await positie();
  await page.clock.fastForward(11000);
  await expect(kaarten).toHaveCount(7);
  expect(Math.abs((await positie()) - voor)).toBeLessThan(5);
});
