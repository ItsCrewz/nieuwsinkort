import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metOvergang } from "../../src/beweging";

const g = globalThis as unknown as Record<string, unknown>;
const dataset: Record<string, string> = {};
const doc: Record<string, unknown> = { hidden: false, documentElement: { dataset } };
g.document = doc;
let reduce = false;
g.window = { matchMedia: () => ({ matches: reduce }) };
const artikelen = JSON.parse(readFileSync("tests/fixtures/wolf-bram-feeds.json", "utf8")) as { href: string }[];
let geselecteerd: string | null = null;
const kies = (artikel: string | null) => () => { geselecteerd = artikel; };
const afloop: { klaar: () => void; breekAf: (fout: Error) => void }[] = [];
doc.startViewTransition = (cb: () => void) => {
  cb();
  return { finished: new Promise<void>((klaar, breekAf) => { afloop.push({ klaar, breekAf }); }) };
};

const eerste = metOvergang(kies(artikelen[0].href), "open");
const tweede = metOvergang(kies(null), "terug");
const derde = metOvergang(kies(artikelen[1].href), "open");
afloop[0].klaar();
await eerste;
assert.equal(dataset.overgang, "open");
afloop[1].breekAf(new Error("afgebroken"));
await tweede;
assert.equal(dataset.overgang, "open");
assert.equal(geselecteerd, artikelen[1].href);
afloop[2].klaar();
await derde;
assert.equal(dataset.overgang, undefined);

const vierde = metOvergang(kies(artikelen[0].href), "open");
reduce = true;
await metOvergang(kies(null), "terug");
assert.equal(geselecteerd, null);
assert.equal(dataset.overgang, undefined);
afloop[3].breekAf(new Error("afgebroken"));
await vierde;
assert.equal(dataset.overgang, undefined);

reduce = false;
doc.startViewTransition = () => { throw new Error("geweigerd"); };
await metOvergang(kies(artikelen[0].href), "open");
assert.equal(geselecteerd, artikelen[0].href);
assert.equal(dataset.overgang, undefined);
