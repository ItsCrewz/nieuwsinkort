// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { merge } from "../functions/data.json";
import { schoon } from "../src/schoon";
import { parseYouTube, ytGeblokkeerdeShorts } from "../worker/src/videos";

let n = 0;
// Vaste klok (midden op de dag, Amsterdam): merge() rekent met de Amsterdamse dag, dus de echte klok maakte de test rond middernacht onbetrouwbaar.
const MIDDAG = Date.parse("2026-10-29T12:00:00+01:00");
const t = (name: string, fn: () => void | Promise<void>, nu = MIDDAG) => {
  const origineel = Date.now;
  Date.now = () => nu;
  const klaar = () => { Date.now = origineel; n++; console.log("✓", name); };
  try {
    const resultaat = fn();
    if (resultaat instanceof Promise) return resultaat.then(klaar, (e) => { Date.now = origineel; throw e; });
    klaar();
  } catch (e) { Date.now = origineel; throw e; }
};

t("merge + schoon: uur-filmpjes en statische filmpjes ontdubbeld, foto's per bericht uniek", () => {
  const now = new Date(Date.now()).toISOString();
  const S = { gegenereerd: new Date(Date.now() - 3600e3).toISOString(), items: [{ cat: "nl", kop: "A", bronnen: [{ site: "NOS", href: "https://nos.nl/1" }], beeld: "https://cdn.nos.nl/a-1200x675.jpg", beelden: ["https://cdn.nos.nl/a-600x338.jpg"] }],
    filmpjes: [{ titel: "Zelfde clip over de storm in Haarlem vandaag", href: "https://www.youtube.com/shorts/ccccccccccc", bron: "YouTube", tijd: "07:00" }], dumpert: [] };
  const H = { gegenereerd: now, items: [], dumpert: [], meta: { aiStand: "zuinig" },
    filmpjes: [{ titel: "Zelfde clip over de storm in Haarlem vandaag!", href: "https://www.instagram.com/reel/ZZZ/", bron: "Instagram", embed: "https://x/v.mp4", tijd: "23:59" },
      { titel: "x", href: "https://youtu.be/ccccccccccc?si=2", bron: "YouTube", tijd: "23:59" }] };
  const out = schoon(merge(S, H));
  assert.equal(out.filmpjes.length, 1, JSON.stringify(out.filmpjes));
  assert.equal(out.items[0].beelden.length, 1);
  assert.equal(out.uur.ai, "zuinig");
  assert.equal(out.ontdubbeld.filmpjes, 2);
});

console.log(`\n${n} tests geslaagd`);

t("merge weert ook geblokkeerde routinevideo's uit beide lijsten", () => {
  const nu = new Date(Date.now()).toISOString();
  const video = { href: "https://youtu.be/gmkJBKiE77Q" };
  const S = { gegenereerd: nu, items: [], filmpjes: [video], dumpert: [video] };
  const H = { gegenereerd: nu, items: [], filmpjes: [], dumpert: [], ytGeblokkeerd: ["gmkJBKiE77Q"] };
  const uit = merge(S, H);
  assert.deepEqual(uit.filmpjes, []);
  assert.deepEqual(uit.dumpert, []);
});

t("merge weert F1-Shorts via de kanaalblokkade van de Worker", () => {
  const nu = new Date(Date.now()).toISOString();
  const xml = `<entry><yt:videoId>gmkJBKiE77Q</yt:videoId><title>F1</title><link rel="alternate" href="https://www.youtube.com/shorts/gmkJBKiE77Q"/><published>${nu}</published></entry>`;
  const videos = parseYouTube(xml, "FORMULA 1", 0, () => "12:00");
  const lang = { href: "https://www.youtube.com/watch?v=abcdefghijk", titel: "Lange video", bron: "YouTube" };
  const S = { gegenereerd: nu, items: [], filmpjes: [...videos, lang], dumpert: [] };
  const H = { gegenereerd: nu, items: [], filmpjes: [], dumpert: [], ytGeblokkeerd: ytGeblokkeerdeShorts(videos) };
  assert.deepEqual(merge(S, H).filmpjes.map((v: any) => v.href), [lang.href]);
});

// Daggrens (#397, #400): vlak voor en na middernacht Amsterdam (wintertijd, UTC+1).
const grensTest = (gen: string, verwacht: "uur" | "statisch", statischBlijft = true) => () => {
  const S = { gegenereerd: "2026-10-29T10:00:00+01:00", items: [{ cat: "nl", kop: "Statisch", bronnen: [{ site: "NOS", href: "https://nos.nl/s" }] }], filmpjes: [], dumpert: [] };
  const H = { gegenereerd: gen, items: [{ cat: "nl", kop: "Uur", bronnen: [{ site: "NOS", href: "https://nos.nl/u" }] }], filmpjes: [], dumpert: [] };
  const uit = merge(S, H);
  assert.equal(uit.items.some((i: any) => i.kop === "Uur"), verwacht === "uur");
  assert.equal(uit.items.some((i: any) => i.kop === "Statisch"), statischBlijft);
};
t("merge 23:59 Amsterdam: uur-data van dezelfde dag wordt gemerged", grensTest("2026-10-29T23:50:00+01:00", "uur"), Date.parse("2026-10-29T23:59:00+01:00"));
t("merge 00:30 Amsterdam: uur-data van gisteren wordt niet gebruikt (statisch blijft)", grensTest("2026-10-29T23:50:00+01:00", "statisch"), Date.parse("2026-10-30T00:30:00+01:00"));
t("merge 00:30 Amsterdam: uur-data van de nieuwe dag wordt wel gebruikt, statische data van gisteren valt weg", grensTest("2026-10-30T00:20:00+01:00", "uur", false), Date.parse("2026-10-30T00:30:00+01:00"));
