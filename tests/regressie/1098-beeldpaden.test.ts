import assert from "node:assert/strict";
import { uniekeBeelden } from "../../src/beeld";
import { schoon } from "../../src/schoon";

const eerste = "https://cdn.voorbeeld.nl/nieuws/artikel-een/1200x675/persfoto-stadhuis.jpg";
const tweede = "https://cdn.voorbeeld.nl/nieuws/artikel-twee/1200x675/persfoto-stadhuis.jpg";
const variant = "https://www.voorbeeld.nl/nieuws/artikel-een/600x338/persfoto-stadhuis.jpg";
const jetpack = "https://i0.wp.com/voorbeeld.nl/nieuws/artikel-een/persfoto-stadhuis-600x338.jpg";
const resizer = `https://wsrv.nl/?url=${encodeURIComponent(eerste)}&w=800`;
const invoer = [eerste, variant, jetpack, resizer, tweede];

assert.deepEqual(uniekeBeelden(invoer), [eerste, tweede]);
assert.deepEqual(uniekeBeelden(invoer, 1), [eerste]);
assert.deepEqual(schoon({ items: [{ beelden: invoer }] }).items[0].beelden, [eerste, tweede]);
const fotos = Array.from({ length: 14 }, (_, i) => `https://voorbeeld.nl/nieuws/artikel-${i}/persfoto-stadhuis.jpg`);
assert.deepEqual(uniekeBeelden(fotos), fotos.slice(0, 12));
