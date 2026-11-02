// Regressie (Joey 02-11, #488): "Ook komt er een nieuwe reisset beschikbaar via iCulture." — iCulture is de nieuwssite die erover schrijft, niet de verkoper.
// De prompts verbieden het en een deterministische nacontrole haalt het weg (nieuwe samenvatting in de Worker, weergave in de client). Fixture: tests/fixtures/joey/icculture.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { summarize, verdiep, type Usage } from "../../worker/src/ai";
import { DetailView } from "../../src/detail";
import type { Item, Meer } from "../../src/types";

const fx = JSON.parse(readFileSync("tests/fixtures/joey/icculture.json", "utf8")) as { item: Item; meer: Meer };
const t = (naam: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => console.log("ok -", naam));
const usage = (): Usage => ({ neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 });
const KOP = "Apple brengt nieuwe MacBook-adapters en reisset uit";

await t("de live tekst bevat de fout (fixture is echt)", () => {
  assert.match(fx.item.ai, /beschikbaar via iCulture\./);
});

await t("een nieuwe samenvatting waarin het model toch 'via iCulture' schrijft, wordt in de Worker schoongemaakt", async () => {
  const som = { id: 1, kop: KOP, ai: fx.item.ai, samenvatting: "De nieuwe adapters hebben een nieuwe aansluiting. De reisset is te koop via iCulture.", punten: ["De set bevat een verlengkabel"] };
  const ai = { run: async () => ({ response: JSON.stringify({ items: [som] }) }) };
  const res = await summarize(ai as any, "@cf/google/gemma-4-26b-a4b-it", [{ id: 1, cat: "tech", bronnen: ["iCulture"], titels: [KOP], tekst: "Apple brengt nieuwe adapters uit." }], usage());
  const s = res.get(1)!;
  assert.ok(s, "som wordt niet afgekeurd");
  assert.ok(!/iCulture/.test(`${s.ai} ${s.samenvatting}`), `bron nog genoemd: ${s.ai} | ${s.samenvatting}`);
  assert.equal(s.ai, "Apple lanceert nieuwe stroomadapters voor de MacBook. Ook komt er een nieuwe reisset beschikbaar.");
});

await t("beide prompts verbieden de bron als verkoper, aanbieder of kanaal", async () => {
  const prompts: string[] = [];
  const ai = { run: async (_m: string, o: any) => { prompts.push(o.messages[1].content); return { response: "{}" }; } };
  await summarize(ai as any, "@cf/google/gemma-4-26b-a4b-it", [{ id: 1, cat: "tech", bronnen: ["iCulture"], titels: [KOP], tekst: "x" }], usage());
  await verdiep(ai as any, "@cf/google/gemma-4-26b-a4b-it", [{ id: 1, kop: KOP, kort: "x", bronnen: [{ site: "iCulture", tekst: "x" }] }], usage());
  assert.equal(prompts.length >= 2, true);
  for (const p of [prompts[0], prompts[prompts.length - 1]]) assert.match(p, /nooit verkoper, aanbieder of kanaal|nooit als verkoper, aanbieder of kanaal/);
});

await t("bestaand item: de detailpagina toont de zin zonder 'via iCulture' (client, geen nieuwe samenvatting nodig)", () => {
  const h = renderToStaticMarkup(createElement(DetailView, { item: fx.item, onBack: () => {}, bionic: false }));
  assert.ok(h.includes("Ook komt er een nieuwe reisset beschikbaar."), "zin blijft, zonder bron");
  assert.ok(!h.includes("beschikbaar via iCulture"));
  assert.ok(h.includes("iculture.nl/nieuws/apple-macbook-opladers-ac-connector-2"), "de bronlink blijft");
});

const { stripBronvermelding, heeftBronvermelding } = await import("../../src/bronvermelding");
const { uitgebreidOntdubbeld } = await import("../../src/uitgebreid");

await t("stripBronvermelding: eindvermelding en 'via' eruit; toeschrijving aan het begin en andere namen blijven", () => {
  const sites = ["iCulture"];
  assert.equal(stripBronvermelding(fx.item.ai, sites), "Apple lanceert nieuwe stroomadapters voor de MacBook. Ook komt er een nieuwe reisset beschikbaar.");
  assert.equal(stripBronvermelding("De set is te koop via iCulture, zegt Apple.", sites), "De set is te koop, zegt Apple.");
  assert.equal(stripBronvermelding("Het nieuws is er, aldus iCulture.", sites), "Het nieuws is er, aldus iCulture.");
  assert.equal(stripBronvermelding("Volgens iCulture is de set er.", sites), "Volgens iCulture is de set er.");
  assert.equal(stripBronvermelding("De set is te koop via Coolblue.", sites), "De set is te koop via Coolblue.");
  assert.equal(stripBronvermelding("Het gaat om de iCultureshop.", sites), "Het gaat om de iCultureshop.");
  assert.equal(stripBronvermelding("Tekst via de Volkskrant.", ["de Volkskrant"]), "Tekst via de Volkskrant.");
  assert.equal(stripBronvermelding("Tekst via Volkskrant.", ["de Volkskrant"]), "Tekst via Volkskrant.");
  assert.equal(stripBronvermelding("Tekst zonder bron.", []), "Tekst zonder bron.");
  assert.ok(heeftBronvermelding(fx.item.ai, sites));
});

await t("AI-uitleg onder Uitgebreid: 'Je kunt deze kopen via iCulture' blijft in de data, maar de client toont het niet (zie detail.tsx)", () => {
  assert.ok(fx.meer.uitleg!.join(" ").includes("via iCulture"));
  const uit = uitgebreidOntdubbeld(fx.item, { uitleg: fx.meer.uitleg!.map((p) => stripBronvermelding(p, ["iCulture"])) }).uitgebreid.join(" ");
  assert.ok(uit.includes("AC Connector") || uit.includes("watt"));
  assert.ok(!uit.includes("via iCulture"));
});

await t("alleen een volledig gematchte bron in verkoopcontext", () => {
  assert.equal(stripBronvermelding("De wedstrijd is live te volgen via NOS.", ["NOS"]), "De wedstrijd is live te volgen via NOS.");
  assert.equal(stripBronvermelding("De berichten gaan via WhatsApp.", ["WhatsApp"]), "De berichten gaan via WhatsApp.");
  assert.equal(stripBronvermelding("Het is te koop via NU.nl.", ["NU", "NU.nl"]), "Het is te koop.");
  assert.equal(stripBronvermelding("Het is te koop via NU.nlshop.", ["NU", "NU.nl"]), "Het is te koop via NU.nlshop.");
  assert.equal(stripBronvermelding("Het is te koop via NOS.", ["iCulture"]), "Het is te koop via NOS.");
});
