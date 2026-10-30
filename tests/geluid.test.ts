import assert from "node:assert/strict";
import { soundOn, saveSound } from "../src/geluid";

function opslag() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, clear: () => data.clear() };
}
const sessie = opslag();
const lokaal = opslag();
Object.assign(globalThis, { window: { sessionStorage: sessie, localStorage: lokaal } });
assert.equal(soundOn(), true);
saveSound(false);
assert.equal(sessie.getItem("nieuwsinkort-geluid"), "0");
assert.equal(lokaal.getItem("nieuwsinkort-geluid"), "0");
assert.equal(soundOn(), false);
sessie.clear();
assert.equal(soundOn(), false);
saveSound(true);
lokaal.setItem("nieuwsinkort-geluid", "0");
assert.equal(soundOn(), true);
const geblokkeerd = { getItem() { throw Error(); }, setItem() { throw Error(); } };
Object.assign(globalThis, { window: { sessionStorage: geblokkeerd, localStorage: lokaal } });
assert.equal(soundOn(), true);
Object.assign(globalThis, { window: { sessionStorage: geblokkeerd, localStorage: geblokkeerd } });
saveSound(false);
assert.equal(soundOn(), false);
saveSound(true);
assert.equal(soundOn(), true);
console.log("geluid: opslagtests geslaagd");
