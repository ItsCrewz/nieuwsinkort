import assert from "node:assert/strict";
import { dagdata } from "../src/dagdata";
import { vandaagHtml } from "../functions/vandaag";

// #1130: optionele velden (id, t, gisteren) worden op de server genormaliseerd vóór dagselectie en linkbouw.
const echteTijd = Date.now;
try {
  Date.now = () => Date.parse("2026-11-04T11:00:00Z");
  const vid = (href: string, extra: object) => ({ titel: href, ai: "", bron: "YouTube", href, thumb: "https://x.test/t.jpg", populariteit: "", tijd: "11:00", t: Date.parse("2026-11-04T10:30:00Z"), ...extra });
  const item = { cat: "nl", kop: "Test kop", ai: "a", samenvatting: "s", tijd: "10:00", punten: [], bronnen: [{ site: "NOS", href: "https://nos.nl/a" }], t: Date.parse("2026-11-04T09:00:00Z") };
  const H = {
    gegenereerd: "2026-11-04T10:55:00Z", datum: "x", items: [{ ...item, id: "../x" }],
    filmpjes: [vid("https://y.test/1", { gisteren: "false" }), vid("https://y.test/2", { t: "5" })], dumpert: [], meta: {},
  };
  const S = { gegenereerd: "2026-11-04T08:00:00Z", items: [], filmpjes: [], dumpert: [] };
  const draai = async (kv: Record<string, unknown>, pad = "/data.json") => {
    const env = { ASSETS: { fetch: async () => Response.json(S) }, NIEUWS: { get: async (k: string) => kv[k] ?? null } };
    return await (await dagdata({ request: new Request("https://site.test" + pad), env })).json() as any;
  };
  const controle = (d: any) => {
    // gisteren "false" telt niet als gisteren; ongeldige t wordt weggelaten
    assert.ok(d.filmpjes.some((v: any) => v.href === "https://y.test/1"), "gisteren:'false' blijft vandaag");
    assert.ok(d.filmpjes.every((v: any) => v.gisteren === undefined && (v.href !== "https://y.test/2" || v.t === undefined)));
    assert.ok(d.items.every((i: any) => i.id === undefined), "ongeldig id weg");
  };
  controle(await draai({ uur: H }));
  controle(await draai({ "data-vooraf": "2026-11-04\n" + "{}\n" + JSON.stringify(H) }));
  // Servergelinkte pagina: geen ../ in de link
  const d = await draai({ uur: H });
  const html = vandaagHtml(d.items, "2026-11-04");
  assert.ok(html.includes('href="/bericht/2026-11-04/'));
  assert.ok(!html.includes(".."), "geen ../ in serverlink");
} finally { Date.now = echteTijd; }
