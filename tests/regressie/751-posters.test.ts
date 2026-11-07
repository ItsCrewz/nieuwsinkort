import assert from "node:assert/strict";
import { aantalActievePosters, GELIJK, POSTER_MAX_MS, voerUit } from "../../src/voorladen";

const origineel = Object.getOwnPropertyDescriptors(globalThis);
const installeer = (naam: string, waarde: unknown) => Object.defineProperty(globalThis, naam, { value: waarde, configurable: true, writable: true });
const afbeeldingen: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
const timers = new Map<number, () => void>();
let teller = 0;
installeer("Image", class {
  src = ""; decoding = ""; referrerPolicy = ""; fetchPriority = "";
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { afbeeldingen.push(this); }
});
installeer("setTimeout", (fn: () => void, ms: number) => {
  assert.equal(ms, POSTER_MAX_MS);
  timers.set(++teller, fn);
  return teller;
});
installeer("clearTimeout", (id: number) => timers.delete(id));

try {
  for (let ronde = 0; ronde < 4; ronde++) {
    const begin = afbeeldingen.length;
    const p = { thumbs: Array.from({ length: GELIJK + 1 }, (_, i) => `https://posters.example/${ronde}/${i}.jpg`), preconnect: [], hlsChunk: false, hls: [], mp4: null };
    voerUit(p);
    voerUit(p);
    assert.equal(aantalActievePosters(), GELIJK);
    assert.equal(afbeeldingen.length - begin, GELIJK);
    afbeeldingen[begin].onload!();
    afbeeldingen[begin + 1].onerror!();
    timers.values().next().value!();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(afbeeldingen.length - begin, GELIJK + 1);
    assert.equal(aantalActievePosters(), 1);
    afbeeldingen[begin + GELIJK].onload!();
    assert.equal(aantalActievePosters(), 0);
    assert.equal(timers.size, 0);
    assert.equal(afbeeldingen[begin].onload, null);
    assert.equal(afbeeldingen[begin + 1].onerror, null);
    assert.equal(afbeeldingen[begin + 2].onload, null);
  }
  console.log("✓ afgeronde posters worden vrijgegeven, ook na fout en timeout");
} finally {
  for (const naam of ["Image", "setTimeout", "clearTimeout"]) {
    if (origineel[naam]) Object.defineProperty(globalThis, naam, origineel[naam]);
    else Reflect.deleteProperty(globalThis, naam);
  }
}
