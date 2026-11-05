import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prefetchMeer } from "../../src/meer";
import { uitgebreidOntdubbeld } from "../../src/uitgebreid";
import type { Item, Meer } from "../../src/types";

const fixture = JSON.parse(readFileSync("tests/fixtures/joey/icculture.json", "utf8")) as { item: Item; meer: Meer };
const geldig: Meer = { ...fixture.meer, perBron: [{ site: "iCulture", href: "https://www.iculture.nl/", punten: ["Een punt"] }], uittreksel: [{ site: "iCulture", href: "https://www.iculture.nl/", alineas: ["Een alinea"] }] };
const fout = ["{", "null", "[]", JSON.stringify({ uitleg: "tekst" }), JSON.stringify({ uitleg: [1] }), JSON.stringify({ perBron: [null] }), JSON.stringify({ perBron: [{ site: 1, href: "x", punten: [] }] }), JSON.stringify({ perBron: [{ site: "x", href: null, punten: [] }] }), JSON.stringify({ perBron: [{ site: "x", href: "x", punten: [null] }] }), JSON.stringify({ uittreksel: [{ site: "x", href: "x", alineas: "tekst" }] }), JSON.stringify({ uittreksel: [{ site: "x", href: "x", alineas: [1] }] })];
const echteFetch = globalThis.fetch;
try {
  for (const [i, antwoord] of fout.entries()) {
    const item = { ...fixture.item, meer: `validatie-678-${i}` };
    let aantal = 0;
    globalThis.fetch = (async () => { aantal++; return new Response(aantal === 1 ? antwoord : JSON.stringify(geldig)); }) as typeof fetch;
    const eerste = prefetchMeer(item);
    assert.equal(prefetchMeer(item), eerste, "lopende verzoeken worden gedeeld");
    assert.equal(await eerste, null);
    assert.doesNotThrow(() => uitgebreidOntdubbeld(item, null));
    assert.deepEqual(await prefetchMeer(item), geldig, "een volgend verzoek herstelt");
    assert.deepEqual(await prefetchMeer(item), geldig, "geldig antwoord blijft bewaard");
    assert.equal(aantal, 2);
  }
} finally { globalThis.fetch = echteFetch; }
console.log("ok - ongeldige extra artikeltekst valt veilig terug en herstelt");
