import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { berekenBody } from "../../src/dagdata";

const [a, b] = JSON.parse(readFileSync("tests/fixtures/joey/dubbel-borsato-1600-509.json", "utf8")).borsato;
const nu = Date.parse("2026-11-17T12:00:00Z");
const origineel = Date.now;
Date.now = () => nu;
try {
  const foto = "https://voorbeeld.nl/foto.jpg";
  const andereFoto = "https://voorbeeld.nl/andere.jpg";
  const enkel = { ...a, t: nu - 60000, beeld: foto, beelden: undefined, bronnen: [{ site: "NOS", href: "https://nos.nl/een" }] };
  const lijst = { ...b, t: nu - 120000, beeld: undefined, beelden: [andereFoto, "https://voorbeeld.nl/logo.png"], bronnen: [{ site: "RTL", href: "https://rtl.nl/twee" }] };
  const los = { kop: "Een afzonderlijk bericht", t: nu - 180000, beeld: "https://voorbeeld.nl/los.jpg", bronnen: [{ site: "AD", href: "https://ad.nl/drie" }] };
  for (const hoofdEnkel of [true, false]) {
    const extra = { site: "AD", href: "https://ad.nl/vier" };
    const een = { ...enkel, bronnen: hoofdEnkel ? [...enkel.bronnen, extra] : enkel.bronnen };
    const twee = { ...lijst, bronnen: hoofdEnkel ? lijst.bronnen : [...lijst.bronnen, extra] };
    const routine = { gegenereerd: new Date(nu - 3600000).toISOString(), items: [een, los] };
    const uur = { gegenereerd: new Date(nu).toISOString(), items: [twee] };
    const uit = JSON.parse(await berekenBody(routine, uur, null, nu));
    assert.equal(uit.items.length, 2);
    const samen = uit.items.find((i: any) => i.kop === (hoofdEnkel ? een.kop : twee.kop));
    assert.deepEqual(new Set(samen.beelden.map((u: string) => u.split("?")[0])), new Set([foto, andereFoto]));
    assert.equal(samen.beelden.length, 2);
    assert.equal(samen.beeld, undefined);
    assert.equal(samen.samenvatting, een.samenvatting);
    assert.equal(samen.bronnen.length, 3);
    assert.deepEqual(uit.items.find((i: any) => i.kop === los.kop).beelden, [los.beeld]);
  }
} finally { Date.now = origineel; }
console.log("✓ #1348 samengevoegde nieuwsbeelden blijven behouden en worden opgeschoond");
