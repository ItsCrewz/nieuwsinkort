import assert from "node:assert/strict";
import { beeldKey, uniekeBeelden } from "../../src/beeld";

const foto = "https://voorbeeld.nl/nieuws/foto.jpg";
const proxy = (url: string) => `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
const normaal = proxy(`https://site.nl/_next/image?src=${encodeURIComponent(foto)}&w=800`);
assert.equal(beeldKey(normaal), beeldKey(foto));
assert.deepEqual(uniekeBeelden([normaal, foto]), [normaal]);

// Zonder codering kan metadata een zeer lange keten vormen zonder exponentiële groei.
const diep = "https://wsrv.nl/?url=".repeat(10000) + foto;
assert.equal(beeldKey(diep), diep);
assert.equal(beeldKey(diep), beeldKey(diep));
const ander = diep + "?ander=1";
assert.notEqual(beeldKey(diep), beeldKey(ander));
assert.equal(beeldKey("https://wsrv.nl/?url=https://["), "https://[");
