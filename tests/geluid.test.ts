import assert from "node:assert/strict";
import { soundOn, saveSound, geluidTik, onthoudGeluidTik, volgGeluid } from "../src/geluid";

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
// Synchronisatie tussen tabbladen (#1039).
{
  const luisteraars = new Set<(e: any) => void>();
  const sessie2 = opslag();
  Object.assign(globalThis, { window: { sessionStorage: sessie2, localStorage: lokaal,
    addEventListener: (_: string, f: (e: any) => void) => { luisteraars.add(f); },
    removeEventListener: (_: string, f: (e: any) => void) => { luisteraars.delete(f); } } });
  const gezien: boolean[] = [];
  const stop = volgGeluid((a) => gezien.push(a));
  const stuur = (key: string | null, newValue: string | null) => luisteraars.forEach((f) => f({ key, newValue }));
  saveSound(true);
  stuur("nieuwsinkort-geluid", "0");
  assert.equal(soundOn(), false);
  assert.equal(sessie2.getItem("nieuwsinkort-geluid"), "0");
  stuur("nieuwsinkort-geluid", "1");
  assert.equal(soundOn(), true);
  assert.deepEqual(gezien, [false, true]);
  stuur("anders", "0");
  stuur("nieuwsinkort-geluid", "2");
  stuur("nieuwsinkort-geluid", null);
  assert.equal(soundOn(), true);
  assert.equal(gezien.length, 2);
  // Geluidstik blijft per document: een andere tab zet dit tabblad niet "getikt".
  const voor = geluidTik();
  stuur("nieuwsinkort-geluid", "1");
  assert.equal(geluidTik(), voor);
  stop();
  assert.equal(luisteraars.size, 0);
  // Geblokkeerde opslag: eigen keuze blijft, ook zonder events.
  Object.assign(globalThis, { window: { sessionStorage: geblokkeerd, localStorage: geblokkeerd } });
  assert.doesNotThrow(() => volgGeluid(() => {})());
  saveSound(false);
  assert.equal(soundOn(), false);
  saveSound(true);
  assert.equal(soundOn(), true);
}
// Getikt per document (#437): een oude sessionStorage-vlag telt niet mee.
sessie.setItem("nieuwsinkort-geluid-tik", "1");
Object.assign(globalThis, { window: { sessionStorage: sessie, localStorage: lokaal }, sessionStorage: sessie });
assert.equal(geluidTik(), false);
onthoudGeluidTik();
assert.equal(geluidTik(), true);
console.log("geluid: opslagtests geslaagd");
