import assert from "node:assert/strict";
import { bronUrl, naarRechtstreeks, preloadBeeld } from "../../src/beelden";
import { beeldViaProxy } from "../../src/beeldhost";

class NepImage {
  static beelden: NepImage[] = [];
  src = "";
  referrerPolicy = "";
  decoding = "";
  klaar!: () => void;
  fout!: (reden: Error) => void;
  private resultaat = new Promise<void>((resolve, reject) => { this.klaar = resolve; this.fout = reject; });
  constructor() { NepImage.beelden.push(this); }
  decode() { return this.resultaat; }
}

const image = Object.getOwnPropertyDescriptor(globalThis, "Image");
const nu = Date.now;
let tijd = 1_000_000;
Date.now = () => tijd;
Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: NepImage });
try {
  const url = "https://images.nu.nl/m/725.jpg";
  const proxy = beeldViaProxy(url);
  const eerste = preloadBeeld(url);
  assert.strictEqual(preloadBeeld(url), eerste);
  assert.equal(NepImage.beelden[0].src, proxy);
  NepImage.beelden[0].fout(new Error("tijdelijke storing"));
  await Promise.resolve();
  assert.equal(NepImage.beelden[1].src, url);
  assert.equal(naarRechtstreeks(url, proxy), true);
  NepImage.beelden[1].klaar();
  await eerste;
  await preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 2);
  tijd += 60_000;
  assert.equal(bronUrl(url), proxy);
  const herstel = preloadBeeld(url);
  assert.equal(NepImage.beelden[2].src, proxy);
  NepImage.beelden[2].klaar();
  await herstel;
  await preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 3);

  const stuk = "https://images.nu.nl/m/725-stuk.jpg";
  const poging = preloadBeeld(stuk);
  NepImage.beelden[3].fout(new Error("proxy stuk"));
  await Promise.resolve();
  NepImage.beelden[4].fout(new Error("bron stuk"));
  await poging;
  assert.equal(naarRechtstreeks(stuk, stuk), false);
  assert.equal(bronUrl(stuk), stuk);
  tijd += 60_000;
  const later = preloadBeeld(stuk);
  assert.equal(NepImage.beelden[5].src, beeldViaProxy(stuk));
  NepImage.beelden[5].fout(new Error("proxy nog stuk"));
  await Promise.resolve();
  NepImage.beelden[6].fout(new Error("bron nog stuk"));
  await later;
  assert.equal(naarRechtstreeks(stuk, stuk), false);
  assert.equal(NepImage.beelden.length, 7);
} finally {
  Date.now = nu;
  if (image) Object.defineProperty(globalThis, "Image", image);
  else Reflect.deleteProperty(globalThis, "Image");
}
