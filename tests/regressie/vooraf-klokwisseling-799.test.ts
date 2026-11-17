import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dagdata } from "../../src/dagdata";

// Een bestaand bericht uit live data; de inhoud moet bij vooraf-data intact blijven.
const fixture = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-borsato-1305.json", "utf8"));
const artikel = fixture.items[0];
const klok = Date.now;
const scenarios: { dag: string; gisteren: string; oud: string; offset: string; start?: string; gOffset?: string }[] = [
  { dag: "2026-03-30", gisteren: "2026-03-29", oud: "2026-03-28", offset: "+02:00" },
  { dag: "2026-10-26", gisteren: "2026-10-25", oud: "2026-10-24", offset: "+01:00" },
  // De wisseldagen zelf (23 en 25 uur): vóór 06:00 geldt per tijdstip een andere offset.
  { dag: "2026-03-29", gisteren: "2026-03-28", oud: "2026-03-27", offset: "+02:00", start: "+01:00", gOffset: "+01:00" },
  { dag: "2026-10-25", gisteren: "2026-10-24", oud: "2026-10-23", offset: "+01:00", start: "+02:00", gOffset: "+02:00" },
  { dag: "2026-05-05", gisteren: "2026-05-04", oud: "2026-05-03", offset: "+02:00" },
];
try {
  for (const s of scenarios) {
    let vooraf = "";
    let assets = 0;
    const env = {
      NIEUWS: { get: async (key: string) => key === "data-vooraf" ? vooraf : null },
      ASSETS: { fetch: async () => { assets++; return Response.json({ items: [], filmpjes: [], dumpert: [] }); } },
    };
    const vraag = (tag?: string) => dagdata({ request: new Request("https://voorbeeld.nl/data.json", { headers: tag ? { "If-None-Match": tag } : {} }), env });
    const zetVooraf = (datum: string) => { vooraf = `${datum}\nhash\n${JSON.stringify({ items: [artikel], filmpjes: [], dumpert: [] })}`; };
    zetVooraf(s.gisteren);
    Date.now = () => Date.parse(`${s.gisteren}T23:59:00${s.gOffset ?? s.offset}`);
    assert.deepEqual((await (await vraag()).json()).items, [artikel]);
    for (const tijd of ["00:00:00", "05:59:59"]) {
      const off = tijd === "00:00:00" ? s.start ?? s.offset : s.offset;
      Date.now = () => Date.parse(`${s.dag}T${tijd}${off}`);
      const antwoord = await vraag();
      assert.deepEqual((await antwoord.json()).items, [artikel]);
      assert.equal((await vraag(antwoord.headers.get("etag")!)).status, 304);
      assert.equal(assets, 0);
      zetVooraf(s.oud);
      await vraag();
      assert.equal(assets, 1); // Eén assetaanvraag voor de verouderde data.
      assets = 0;
      zetVooraf(s.gisteren);
    }
    Date.now = () => Date.parse(`${s.dag}T06:00:00${s.offset}`);
    await vraag();
    assert.equal(assets, 1);
    zetVooraf(s.dag);
    assert.deepEqual((await (await vraag()).json()).items, [artikel]);
    assert.equal(assets, 1);
  }
} finally { Date.now = klok; }
