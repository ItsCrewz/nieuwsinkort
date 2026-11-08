import assert from "node:assert/strict";
import { preloadBeeld, bronUrl, naarRechtstreeks } from "../src/beelden";

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

  const cdn = "https://prod-img.telegraaf.nl/public/a%20b.jpg?w=1";
  const viaCdn = preloadBeeld(cdn);
  assert.equal(NepImage.beelden[1].src, "/media/beeld/prod-img.telegraaf.nl/public/a%20b.jpg?w=1"); // zelfde URL als de <img src>
  NepImage.beelden[1].klaar();
  await viaCdn;
  await preloadBeeld(cdn);
  assert.equal(NepImage.beelden.length, 2);

  const misluktUrl = "https://voorbeeld.nl/mislukt.jpg";
  const mislukt = preloadBeeld(misluktUrl);
  assert.equal(NepImage.beelden.length, 3);
  NepImage.beelden[2].fout(new Error("decode mislukt"));
  await mislukt;
  const opnieuw = preloadBeeld(misluktUrl);
  assert.equal(NepImage.beelden.length, 4);
  assert.equal(NepImage.beelden[3].src, misluktUrl);
  NepImage.beelden[3].klaar();
  await opnieuw;
  await preloadBeeld(misluktUrl);
  assert.equal(NepImage.beelden.length, 4);

  // Vangnet: faalt de proxy, dan één keer rechtstreeks (oude gedrag); pas daarna wegvallen
  const aantal = NepImage.beelden.length;
  const tg = "https://prod-img.telegraaf.nl/public/vangnet.jpg";
  const viaVangnet = preloadBeeld(tg);
  assert.equal(NepImage.beelden.length, aantal + 1);
  assert.equal(NepImage.beelden[aantal].src, "/media/beeld/prod-img.telegraaf.nl/public/vangnet.jpg");
  NepImage.beelden[aantal].fout(new Error("403"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(NepImage.beelden.length, aantal + 2, "één rechtstreekse poging");
  assert.equal(NepImage.beelden[aantal + 1].src, tg);
  NepImage.beelden[aantal + 1].klaar();
  await viaVangnet;
  assert.equal(bronUrl(tg), tg, "daarna ook de <img> rechtstreeks");
  await preloadBeeld(tg);
  assert.equal(NepImage.beelden.length, aantal + 2, "geen dubbele download na succes");

  const ook = "https://images.nu.nl/m/vangnet2.jpg";
  const beide = preloadBeeld(ook);
  NepImage.beelden[aantal + 2].fout(new Error("proxy"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(NepImage.beelden[aantal + 3].src, ook);
  NepImage.beelden[aantal + 3].fout(new Error("ook rechtstreeks stuk"));
  await beide;
  assert.equal(NepImage.beelden.length, aantal + 4, "niet vaker dan één keer rechtstreeks");
  assert.equal(naarRechtstreeks(ook), false, "tweede poging niet meer");

  // race: preload faalt eerst (URL in rechtstreeks), daarna onError van een <img> die nog de proxy-URL had
  const race = "https://prod-img.telegraaf.nl/public/race.jpg";
  const proxySrc = "/media/beeld/prod-img.telegraaf.nl/public/race.jpg";
  const raceP = preloadBeeld(race);
  NepImage.beelden[aantal + 4].fout(new Error("403"));
  await new Promise((r) => setTimeout(r, 0));
  NepImage.beelden[aantal + 5].klaar();
  await raceP;
  assert.equal(bronUrl(race), race);
  assert.equal(naarRechtstreeks(race, proxySrc), true, "img met proxy-src: herlaad rechtstreeks, geen drop");
  assert.equal(naarRechtstreeks(race, race), false, "img die al rechtstreeks faalde: drop");
  assert.equal(naarRechtstreeks(race), false);

  // normaal pad: geen extra download; niet-proxybare url krijgt geen rechtstreekse herhaling
  const normaal = preloadBeeld("https://images.nu.nl/m/goed.jpg");
  NepImage.beelden[aantal + 6].klaar();
  await normaal;
  assert.equal(NepImage.beelden.length, aantal + 7);
  assert.equal(bronUrl("https://images.nu.nl/m/goed.jpg"), "/media/beeld/images.nu.nl/m/goed.jpg");
  assert.equal(naarRechtstreeks("https://voorbeeld.nl/x.jpg"), false);

  // Zonder decode(): handlers staan vóór src; al voltooide cachehit en laadfout ronden af, handlers opgeruimd
  class ZonderDecode {
    static beelden: ZonderDecode[] = [];
    referrerPolicy = ""; decoding = ""; complete = false; naturalWidth = 0;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    private _src = "";
    constructor() { ZonderDecode.beelden.push(this); }
    get src() { return this._src; }
    set src(v: string) {
      assert.ok(this.onload && this.onerror, "handlers vóór src");
      this._src = v;
      if (v.includes("cachehit")) { this.complete = true; this.naturalWidth = 10; }
    }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: ZonderDecode });
  await preloadBeeld("https://voorbeeld.nl/cachehit.jpg"); // direct klaar, geen gebeurtenis
  assert.equal(ZonderDecode.beelden[0].onload, null);
  assert.equal(ZonderDecode.beelden[0].onerror, null);
  const fout = preloadBeeld("https://voorbeeld.nl/stuk.jpg");
  ZonderDecode.beelden[1].onerror!();
  await fout;
  assert.equal(ZonderDecode.beelden[1].onload, null);
  assert.equal(ZonderDecode.beelden.length, 2, "geen proxy: geen rechtstreekse herhaling");
  const laat = preloadBeeld("https://voorbeeld.nl/laat.jpg");
  ZonderDecode.beelden[2].onload!();
  await laat;
  assert.equal(ZonderDecode.beelden[2].onerror, null);
} finally {
  if (origineel) Object.defineProperty(globalThis, "Image", origineel);
  else Reflect.deleteProperty(globalThis, "Image");
}
console.log("preloadBeeld: laad- en cachetests geslaagd");