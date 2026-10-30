import assert from "node:assert/strict";
import { preloadBeeld } from "../src/beelden";

class NepImage {
  static beelden: NepImage[] = [];
  referrerPolicy = "";
  decoding = "";
  src = "";
  klaar!: () => void;
  fout!: (reden: Error) => void;
  private resultaat = new Promise<void>((resolve, reject) => { this.klaar = resolve; this.fout = reject; });

  constructor() { NepImage.beelden.push(this); }
  decode() { return this.resultaat; }
}

const origineel = Object.getOwnPropertyDescriptor(globalThis, "Image");
Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: NepImage });
try {
  await Promise.all([preloadBeeld(""), preloadBeeld(undefined)]);
  assert.equal(NepImage.beelden.length, 0);

  const url = "https://voorbeeld.nl/beeld.jpg";
  const eerste = preloadBeeld(url);
  const tweede = preloadBeeld(url);
  assert.strictEqual(eerste, tweede);
  assert.equal(NepImage.beelden.length, 1);
  assert.equal(NepImage.beelden[0].src, url);
  assert.equal(NepImage.beelden[0].referrerPolicy, "no-referrer");
  assert.equal(NepImage.beelden[0].decoding, "async");
  NepImage.beelden[0].klaar();
  await eerste;
  await preloadBeeld(url);
  assert.equal(NepImage.beelden.length, 1);

  const misluktUrl = "https://voorbeeld.nl/mislukt.jpg";
  const mislukt = preloadBeeld(misluktUrl);
  assert.equal(NepImage.beelden.length, 2);
  NepImage.beelden[1].fout(new Error("decode mislukt"));
  await mislukt;
  const opnieuw = preloadBeeld(misluktUrl);
  assert.equal(NepImage.beelden.length, 3);
  assert.equal(NepImage.beelden[2].src, misluktUrl);
  NepImage.beelden[2].klaar();
  await opnieuw;
  await preloadBeeld(misluktUrl);
  assert.equal(NepImage.beelden.length, 3);
} finally {
  if (origineel) Object.defineProperty(globalThis, "Image", origineel);
  else Reflect.deleteProperty(globalThis, "Image");
}
console.log("preloadBeeld: laad- en cachetests geslaagd");