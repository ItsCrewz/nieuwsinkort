import { test, expect } from "@playwright/test";

test("zoekmeldingen volgen alleen de laatste zoekterm", async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  // De bestaande nieuwsfixture blijft actueel voor de datumfilters.
  await page.route("**/data.json", async (route) => {
    const data = await (await route.fetch()).json();
    data.gegenereerd = new Date().toISOString();
    await route.fulfill({ json: data });
  });
  await page.goto("#/");
  await expect(page.locator(".nc-title a").first()).toBeVisible();
  const titel = await page.locator(".nc-title a").first().innerText();
  const knop = page.getByRole("button", { name: "Zoeken", exact: true });
  await knop.focus();
  await page.keyboard.press("Enter");
  const invoer = page.getByRole("searchbox", { name: "Zoek in het nieuws" });
  const status = page.locator(".zoek-status");
  await expect(invoer).toBeFocused();
  await invoer.fill("de");
  await expect(status).toHaveText(/^[2-9][0-9]* resultaten$|^1[0-9]+ resultaten$/);
  await invoer.fill(titel);
  await expect(status).toHaveText("1 resultaat");
  await invoer.fill("onvindbaar711");
  await expect(page.getByText("Geen berichten gevonden voor", { exact: false })).toBeVisible();
  await expect(status).toHaveText("");
  await invoer.fill(titel);
  await expect(status).toHaveText("1 resultaat");
  await invoer.fill("onvindbaar711");
  await page.getByRole("button", { name: "Wis zoekopdracht" }).click();
  await page.waitForTimeout(500);
  await expect(status).toHaveText("");
  await invoer.fill("onvindbaar711");
  await invoer.press("Escape");
  await page.waitForTimeout(500);
  await expect(status).toHaveText("");
  await expect(knop).toBeFocused();
});
