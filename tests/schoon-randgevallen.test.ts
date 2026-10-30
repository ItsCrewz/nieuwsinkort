import assert from "node:assert/strict";
import { schoon } from "../src/schoon";

let n = 0;
const t = (naam: string, fn: () => void) => { fn(); n++; console.log("✓", naam); };

t("null, undefined en primitieve waarden blijven onveranderd", () => {
  for (const waarde of [null, undefined, false, true, 0, 42, "", "tekst", 1n, Symbol("test")]) {
    assert.equal(schoon(waarde), waarde);
  }
});

t("ontbrekende lijsten leveren lege videolijsten en ongedefinieerde items", () => {
  assert.deepEqual(schoon({}), {
    items: undefined, dumpert: [], filmpjes: [], ontdubbeld: { filmpjes: 0, dumpert: 0 },
  });
  assert.deepEqual(schoon({ items: [], dumpert: [], filmpjes: [] }), {
    items: [], dumpert: [], filmpjes: [], ontdubbeld: { filmpjes: 0, dumpert: 0 },
  });
});

t("verkeerd getypte items blijven behouden", () => {
  for (const items of [null, undefined, "berichten", 42, false, { kop: "Bericht" }]) {
    assert.deepEqual(schoon({ items }), {
      items, dumpert: [], filmpjes: [], ontdubbeld: { filmpjes: 0, dumpert: 0 },
    });
  }
});

t("verkeerd getypte videolijsten worden leeg zonder items te verliezen", () => {
  for (const lijst of [null, undefined, "filmpjes", 42, false, { titel: "Filmpje" }]) {
    assert.deepEqual(schoon({ items: [{ kop: "Bericht" }], dumpert: lijst, filmpjes: lijst }), {
      items: [{ kop: "Bericht" }], dumpert: [], filmpjes: [], ontdubbeld: { filmpjes: 0, dumpert: 0 },
    });
  }
});

t("ontbrekende en verkeerd getypte bronnen blijven behouden", () => {
  const invoer = { items: [{ kop: "Zonder bronnen" }, { bronnen: null }, { bronnen: "bron" }, { bronnen: { href: "https://voorbeeld.nl" } }, { bronnen: [] }] };
  assert.deepEqual(schoon(invoer).items, invoer.items);
  assert.equal("bronnen" in schoon(invoer).items[0], false);
});

t("onveilige en ontbrekende hrefs verdwijnen, http en https blijven in volgorde", () => {
  const http = { naam: "Een", href: "http://voorbeeld.nl/bericht" };
  const https = { naam: "Twee", href: " HTTPS://voorbeeld.nl/ander " };
  const invoer = { items: [{ bronnen: [null, {}, { href: null }, { href: "" }, { href: "/bericht" }, { href: "//voorbeeld.nl" }, { href: "javascript:alert(1)" }, { href: "data:text/html,test" }, http, https] }] };
  assert.deepEqual(schoon(invoer).items[0].bronnen, [http, https]);
});

t("onvolledige en vreemde beeldgegevens worden opgeschoond", () => {
  const invoer = { items: [
    { kop: "Zonder beeld" },
    { beeld: "", beelden: "geen lijst" },
    { beeld: "http://voorbeeld.nl/foto.jpg", beelden: [null, 42, "javascript:alert(1)", "https://voorbeeld.nl/logo.png"] },
  ] };
  assert.deepEqual(schoon(invoer).items, [
    { kop: "Zonder beeld" },
    { beelden: "geen lijst" },
    { beelden: ["https://voorbeeld.nl/foto.jpg"] },
  ]);
});

t("opschonen en ontdubbelen muteren de invoer niet", () => {
  const video = Object.freeze({ titel: "Een filmpje", href: "https://voorbeeld.nl/video.mp4", bron: "Bron", tijd: "12:00" });
  const bronnen = Object.freeze([Object.freeze({ href: "https://voorbeeld.nl" }), Object.freeze({ href: "javascript:alert(1)" })]);
  const beelden = Object.freeze(["http://voorbeeld.nl/foto.jpg", "https://voorbeeld.nl/logo.png"]);
  const item = Object.freeze({ kop: "Bericht", beeld: "https://voorbeeld.nl/foto.jpg", beelden, bronnen });
  const invoer = Object.freeze({ items: Object.freeze([item]), dumpert: Object.freeze([video, video]), filmpjes: Object.freeze([video, video]) });
  const origineel = structuredClone(invoer);
  const resultaat = schoon(invoer);
  assert.deepEqual(invoer, origineel);
  assert.deepEqual(resultaat.items, [{ kop: "Bericht", beelden: ["https://voorbeeld.nl/foto.jpg"], bronnen: [{ href: "https://voorbeeld.nl" }] }]);
  assert.deepEqual(resultaat.dumpert, [{ ...video, ook: [{ bron: "Bron", href: "https://voorbeeld.nl/video.mp4" }] }]);
  assert.deepEqual(resultaat.filmpjes, []);
  assert.deepEqual((resultaat as any).ontdubbeld, { filmpjes: 2, dumpert: 1 });
});

t("ongeldige lijstleden en niet-string hrefs geven de huidige fout door", () => {
  assert.throws(() => schoon({ items: [null] }), TypeError);
  assert.throws(() => schoon({ items: [{ bronnen: [{ href: 42 }] }] }), TypeError);
});

console.log(`${n} tests ok`);