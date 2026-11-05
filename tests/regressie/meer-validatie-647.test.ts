import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prefetchMeer } from "../../src/meer";
import { uitgebreidAlineas } from "../../src/uitgebreid";
import type { Item, Meer } from "../../src/types";

const fixture = JSON.parse(readFileSync("tests/fixtures/joey/ipad.json", "utf8")) as { item: Item; meer: Meer };
const ongeldig = [
  { uitleg: "tekst" }, { uitleg: [42] }, { perBron: {} },
  { perBron: [{ site: "NOS", href: "https://nos.nl", punten: [1] }] },
  { uittreksel: [{ site: "NOS", href: "https://nos.nl", alineas: "tekst" }] },
  { uittreksel: [null] }, { perBron: [{ site: {}, href: "https://nos.nl", punten: [] }] }, {},
];
const origineleFetch = globalThis.fetch;
try {
  for (const [i, fout] of ongeldig.entries()) {
    const item = { ...fixture.item, meer: `validatie-647-${i}` };
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify(calls === 1 ? fout : fixture.meer));
    };
    const eerste = prefetchMeer(item);
    assert.equal(prefetchMeer(item), eerste, "gelijktijdige aanvragen delen de belofte");
    assert.equal(await eerste, null);
    assert.deepEqual(uitgebreidAlineas(item, null), uitgebreidAlineas(item, await eerste));
    assert.deepEqual(await prefetchMeer(item), fixture.meer);
    assert.deepEqual(await prefetchMeer(item), fixture.meer);
    assert.equal(calls, 2, "na herstel blijft het geldige antwoord gecachet");
  }
} finally {
  globalThis.fetch = origineleFetch;
}
