import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metOvergang } from "../../src/beweging";

const g = globalThis as unknown as Record<string, unknown>;
const dataset: Record<string, string> = {};
const doc: Record<string, unknown> = { hidden: false, documentElement: { dataset } };
g.document = doc;
g.window = { matchMedia: () => ({ matches: false }) };
const artikelen = JSON.parse(readFileSync("tests/fixtures/wolf-bram-feeds.json", "utf8")) as { href: string }[];
let geselecteerd: string | null = null;
let aanroepen = 0;
const kies = (artikel: string | null) => () => { aanroepen++; geselecteerd = artikel; };

// De browser weigert het starten: openen en sluiten moeten allebei doorgaan.
doc.startViewTransition = () => { throw new Error("overgang geweigerd"); };
await metOvergang(kies(artikelen[0].href), "open");
assert.equal(geselecteerd, artikelen[0].href);
await metOvergang(kies(null), "terug");
assert.equal(geselecteerd, null);
assert.equal(aanroepen, 2);

// Een oudere overgang faalt pas nadat een volgende navigatie is uitgevoerd.
let afwijzen!: (fout: Error) => void;
doc.startViewTransition = (cb: () => void) => {
  cb();
  return { finished: new Promise((_resolve, reject) => { afwijzen = reject; }) };
};
const eerste = metOvergang(kies(artikelen[0].href), "open");
doc.startViewTransition = (cb: () => void) => { cb(); return { finished: Promise.resolve() }; };
await metOvergang(kies(artikelen[1].href), "open");
afwijzen(new Error("overgang afgebroken"));
await eerste;
assert.equal(geselecteerd, artikelen[1].href);
assert.equal(aanroepen, 4);

// Ook een callback die na een synchrone fout alsnog wordt aangeroepen is een no-op.
let uitgesteldeCallback!: () => void;
doc.startViewTransition = (cb: () => void) => { uitgesteldeCallback = cb; throw new Error("overgang geweigerd"); };
await metOvergang(kies(null), "terug");
uitgesteldeCallback();
assert.equal(geselecteerd, null);
assert.equal(aanroepen, 5);
assert.equal(dataset.overgang, undefined);
