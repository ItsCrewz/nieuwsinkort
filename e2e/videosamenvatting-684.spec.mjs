import { test, expect } from "@playwright/test";

// De videogegevens komen uit de bestaande fixture voor #494; de samenvatting is testdata.
test("een opnieuw geopende video toont de beschikbaar gekomen samenvatting", async ({ page }) => {
  const id = "yt-OojWxAiS5ew";
  let vers = false;
  let aanvragen = 0;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) => route.abort());
  await page.route("**/data.json*", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.filmpjes = [{ titel: "Video met ondertitels", bron: "YouTube", href: "https://www.youtube.com/watch?v=OojWxAiS5ew", embed: "https://www.youtube-nocookie.com/embed/OojWxAiS5ew", tijd: "12:00" }];
    data.samenvattingen = vers ? { [id]: { punten: ["Een beschikbaar punt"], bron: "spraak" } } : {};
    await route.fulfill({ response, json: data });
  });
  await page.route("**/samenvatting", (route) => {
    aanvragen++;
    return route.fulfill({ json: { ok: false, code: "geen-tekst", fout: "Geen tekst beschikbaar" } });
  });
  await page.goto(`/#/filmpjes/${id}`);
  await page.getByRole("button", { name: "Samenvatting" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Geen tekst beschikbaar");
  await page.getByRole("button", { name: "Sluit samenvatting" }).click();
  vers = true;
  const verversing = page.waitForResponse((r) => r.url().includes("/data.json") && r.ok());
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await verversing;
  await page.goto("#/");
  await page.goto(`/#/filmpjes/${id}`);
  await page.getByRole("button", { name: "Samenvatting" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Een beschikbaar punt");
  expect(aanvragen).toBe(1);
});
