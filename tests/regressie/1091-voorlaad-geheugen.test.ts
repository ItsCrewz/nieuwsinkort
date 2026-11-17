// #1091: voorladen houdt geen afbeeldingen of onbegrensde administratie vast tijdens lange sessies.
import assert from "node:assert/strict";
import { MAX_GEDAAN, POSTER_MAX_MS, aantalActievePosters, voerUit, type Plan } from "../../src/voorladen";
import { beeldViaProxy } from "../../src/beeldhost";
import { MAX_BEELD_ADMIN, aantalBeeldAdmin, bronUrl, naarRechtstreeks, preloadBeeld } from "../../src/beelden";

type Im = { src: string; onload: (() => void) | null; onerror: (() => void) | null; onabort: (() => void) | null };
const g = globalThis as unknown as Record<string, unknown>;
const beelden: Im[] = [];
g.Image = class {
  src = ""; decoding = ""; referrerPolicy = ""; fetchPriority = "";
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null;
  complete = false; naturalWidth = 0;
  constructor() { beelden.push(this as unknown as Im); }
};
g.location = { href: "https://site.example/", origin: "https://site.example" };
g.window = { location: g.location };
const timers: { f: () => void; ms: number; weg: boolean }[] = [];
const echteTimeout = globalThis.setTimeout;
const echteClear = globalThis.clearTimeout;
g.setTimeout = (f: () => void, ms: number) => { const t = { f, ms, weg: false }; timers.push(t); return t; };
g.clearTimeout = (t: { weg: boolean }) => { if (t) t.weg = true; };
const wacht = () => new Promise<void>((r) => echteTimeout(r, 0));
const plan = (u: string): Plan => ({ thumbs: [u], preconnect: [], hlsChunk: false, hls: [], mp4: null });
const laatste = () => beelden[beelden.length - 1];

try {
  // voorladen.ts: succes, fout en timeout ruimen op
  const begin = beelden.length;
  voerUit(plan("https://img.example/ok.jpg"));
  assert.equal(aantalActievePosters(), 1);
  laatste().onload!();
  await wacht();
  assert.equal(aantalActievePosters(), 0, "succes ruimt op");
  voerUit(plan("https://img.example/fout.jpg"));
  laatste().onerror!();
  await wacht();
  assert.equal(aantalActievePosters(), 0, "fout ruimt op");
  voerUit(plan("https://img.example/traag.jpg"));
  const t = timers.find((x) => x.ms === POSTER_MAX_MS && !x.weg)!;
  t.f();
  await wacht();
  assert.equal(aantalActievePosters(), 0, "timeout ruimt op");
  assert.equal(laatste().src, "", "timeout breekt het laden af");
  // gelijktijdig delen, en na fout opnieuw proberen
  const n = beelden.length;
  voerUit(plan("https://img.example/fout.jpg"));
  voerUit(plan("https://img.example/fout.jpg"));
  assert.equal(beelden.length - n, 1, "gelijktijdige aanvragen delen één taak");
  laatste().onload!();
  await wacht();

  // vele wisselende URL's: administratie begrensd, uitgezette URL laadt opnieuw, recente blijft ontdubbeld
  for (let i = 0; i < MAX_GEDAAN + 50; i++) {
    voerUit(plan(`https://img.example/wissel-${i}.jpg`));
    laatste().onload!();
    await wacht();
  }
  assert.equal(aantalActievePosters(), 0);
  const v = beelden.length;
  voerUit(plan(`https://img.example/wissel-${MAX_GEDAAN + 49}.jpg`));
  assert.equal(beelden.length, v, "recente URL blijft ontdubbeld");
  voerUit(plan("https://img.example/wissel-0.jpg"));
  assert.equal(beelden.length, v + 1, "uitgezette URL laadt opnieuw");
  laatste().onload!();
  await wacht();

  // beelden.tsx: klaar/rechtstreeks begrensd, referentie los bij fout, gedeelde aanvragen
  const a = preloadBeeld("https://nieuws.example/a.jpg");
  assert.equal(preloadBeeld("https://nieuws.example/a.jpg"), a, "gelijktijdig gedeeld");
  assert.equal(aantalBeeldAdmin().bezig, 1);
  for (let k = 0; k < 4 && aantalBeeldAdmin().bezig; k++) { laatste().onerror?.(); await wacht(); } // proxy- en rechtstreekse poging
  await a;
  assert.equal(laatste().src, "", "mislukte preload breekt af");
  assert.equal(aantalBeeldAdmin().bezig, 0);
  for (let i = 0; i < MAX_BEELD_ADMIN + 100; i++) {
    const p = preloadBeeld(`https://nieuws.example/f-${i}.jpg`);
    laatste().onload!();
    await p;
  }
  assert.ok(aantalBeeldAdmin().klaar <= MAX_BEELD_ADMIN, "klaar begrensd");
  assert.ok(aantalBeeldAdmin().rechtstreeks <= MAX_BEELD_ADMIN, "rechtstreeks begrensd");
  const w = beelden.length;
  const opnieuw = preloadBeeld("https://nieuws.example/f-0.jpg");
  assert.equal(beelden.length, w + 1, "uitgezette URL laadt opnieuw");
  laatste().onload!();
  await opnieuw;

  // Een lopende rechtstreekse poging kan uit de administratie verdwijnen.
  const oud = "https://images.nu.nl/oud.jpg";
  const lopend = preloadBeeld(oud);
  assert.notEqual(laatste().src, oud, "eerste poging gebruikt de proxy");
  laatste().onerror!();
  const directePoging = laatste();
  assert.equal(directePoging.src, oud);
  for (let i = 0; i < MAX_BEELD_ADMIN + 1; i++) {
    const u = `https://images.nu.nl/proxy-${i}.jpg`;
    const p = preloadBeeld(u);
    assert.notEqual(laatste().src, u);
    laatste().onerror!();
    assert.equal(laatste().src, u);
    laatste().onload!();
    await p;
  }
  assert.equal(aantalBeeldAdmin().rechtstreeks, MAX_BEELD_ADMIN);
  assert.notEqual(bronUrl(oud), oud, "oudste fallback is uitgezet");
  assert.equal(naarRechtstreeks(oud, oud), false, "falende rechtstreekse afbeelding valt weg na uitzetting");
  const aantal = beelden.length;
  directePoging.onerror!();
  await lopend;
  assert.equal(beelden.length, aantal, "falende rechtstreekse preload probeert niet opnieuw");
  assert.equal(directePoging.src, "");
  const herladen = preloadBeeld(oud);
  assert.notEqual(laatste().src, oud, "uitgezette fallback begint opnieuw via de proxy");
  laatste().onerror!();
  assert.equal(laatste().src, oud);
  laatste().onload!();
  await herladen;

  // #1158: een actief beeld houdt zijn rechtstreekse terugval terwijl veel andere mislukte URL's de set vullen;
  // na uitzetting volgt precies één herstelpoging, zonder foutlus.
  const actief = "https://images.nu.nl/actief.jpg";
  assert.equal(naarRechtstreeks(actief, bronUrl(actief)), true, "proxy gefaald: rechtstreekse poging");
  for (let i = 0; i < MAX_BEELD_ADMIN * 2; i++) {
    assert.equal(bronUrl(actief), actief, "actief beeld blijft rechtstreeks");
    naarRechtstreeks(`https://images.nu.nl/storing-${i}.jpg`, beeldViaProxy(`https://images.nu.nl/storing-${i}.jpg`));
  }
  assert.ok(aantalBeeldAdmin().rechtstreeks <= MAX_BEELD_ADMIN, "veel mislukte beelden: begrensd");
  assert.equal(bronUrl(actief), actief, "actief beeld behoudt terugval na opruimen");
  // Zonder gebruik wordt het beeld uitgezet; opnieuw tonen start via de proxy en krijgt één rechtstreekse poging.
  for (let i = 0; i < MAX_BEELD_ADMIN + 1; i++) naarRechtstreeks(`https://images.nu.nl/leeg-${i}.jpg`, beeldViaProxy(`https://images.nu.nl/leeg-${i}.jpg`));
  assert.notEqual(bronUrl(actief), actief, "ongebruikt beeld is uitgezet");
  assert.equal(naarRechtstreeks(actief, bronUrl(actief)), true, "één herstelpoging na uitzetting");
  assert.equal(naarRechtstreeks(actief, actief), false, "geen foutlus na de rechtstreekse poging");
  console.log("1091 voorlaadgeheugen: oké", begin >= 0);
} finally {
  g.setTimeout = echteTimeout;
  g.clearTimeout = echteClear;
}
