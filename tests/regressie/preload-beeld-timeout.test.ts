import assert from "node:assert/strict";
import { preloadBeeld } from "../../src/beelden";

class NepImage {
  static beelden: NepImage[] = [];
  referrerPolicy = "";
  decoding = "";
  src = "";
  onload = null;
  onerror = null;
  klaar!: () => void;
  fout!: (reden: Error) => void;
  private resultaat = new Promise<void>((resolve, reject) => { this.klaar = resolve; this.fout = reject; });
  constructor() { NepImage.beelden.push(this); }
  decode() { return this.resultaat; }
}

const beeld = Object.getOwnPropertyDescriptor(globalThis, "Image");
const oudeTimeout = globalThis.setTimeout;
const oudeClear = globalThis.clearTimeout;
const timers = new Map<number, () => void>();
let nummer = 0;
Object.defineProperty(globalThis, "Image", { configurable: true, value: NepImage });
globalThis.setTimeout = ((fn: () => void) => { timers.set(++nummer, fn); return nummer; }) as typeof setTimeout;
globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as typeof clearTimeout;
try {
  const url = "https://voorbeeld.nl/vastgelopen.jpg";
  const oud = preloadBeeld(url);
  assert.strictEqual(preloadBeeld(url), oud);
  assert.equal(timers.size, 1);
  timers.get(1)!();
  await oud;
  assert.equal(timers.size, 0);
  const nieuw = preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 2);
  NepImage.beelden[0].klaar();
  await Promise.resolve();
  assert.strictEqual(preloadBeeld(url), nieuw, "late afloop verwijdert de nieuwe poging niet");
  NepImage.beelden[1].fout(new Error("mislukt"));
  await nieuw;
  const derde = preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 3, "late afloop markeert de mislukte foto niet als klaar");
  NepImage.beelden[2].klaar();
  await derde;
  await preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 3);
  assert.equal(timers.size, 0);
} finally {
  globalThis.setTimeout = oudeTimeout;
  globalThis.clearTimeout = oudeClear;
  if (beeld) Object.defineProperty(globalThis, "Image", beeld);
  else Reflect.deleteProperty(globalThis, "Image");
}
