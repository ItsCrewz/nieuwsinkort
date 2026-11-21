import assert from "node:assert/strict";
import { absUrl, decode, igTime, parseFeed, stripHtml } from "../worker/src/parse";

assert.equal(decode("&amp; &#233; &#x1F600; &onbekend;"), "& é 😀 &onbekend;");
assert.equal(decode(""), "");
assert.equal(stripHtml("<![CDATA[<p>Hallo<br> wereld</p><script>weg</script>]]>"), "Hallo wereld");
assert.equal(stripHtml("&lt;b&gt;Nieuws&lt;/b&gt;"), "Nieuws");
assert.equal(absUrl(" /artikel ", "https://voorbeeld.nl/feed"), "https://voorbeeld.nl/artikel");
assert.equal(absUrl("javascript:alert(1)", "https://voorbeeld.nl"), "");
assert.equal(absUrl("/pad", "geen basis"), "");
assert.equal(igTime("https://instagram.com/p/kort/"), null);
assert.equal(igTime("https://instagram.com/p/______________/"), null);
assert.deepEqual(parseFeed("", "https://voorbeeld.nl/feed"), []);
assert.deepEqual(parseFeed('<rss><item><title>Een &amp; twee</title><link>/nieuws</link><pubDate>2026-01-02</pubDate><description><![CDATA[<p>Hallo</p>]]></description><enclosure url="/foto.jpg"/></item></rss>', "https://voorbeeld.nl/feed"), [{ t: "Een & twee", l: "https://voorbeeld.nl/nieuws", d: Date.parse("2026-01-02T11:00:00Z"), s: "Hallo", img: "https://voorbeeld.nl/foto.jpg" }]);
assert.deepEqual(parseFeed('<feed><entry><title>Atom</title><link rel="alternate" href="https://ander.nl/a"/><updated>ongeldig</updated></entry></feed>', "https://voorbeeld.nl"), [{ t: "Atom", l: "https://ander.nl/a", d: null, s: "" }]);
assert.deepEqual(parseFeed('<searchRetrieveResponse><sru:record><dcterms:title>Besluit</dcterms:title><x resourceIdentifier="/besluit"/><dcterms:type>Wet</dcterms:type><dcterms:abstract>Tekst</dcterms:abstract></sru:record></searchRetrieveResponse>', "https://voorbeeld.nl"), [{ t: "Besluit", l: "https://voorbeeld.nl/besluit", d: null, s: "Wet: Tekst" }]);
{
  // SRU gemengd: record zonder en met attributen, met recordPosition ertussen
  const rec = (a: string, n: string) => `<sru:record${a}><sru:recordData><dcterms:title>Titel ${n}</dcterms:title><x resourceIdentifier="/b${n}"/><dcterms:available>2026-01-0${n}</dcterms:available><dcterms:type>Wet</dcterms:type><dcterms:abstract>Tekst ${n}</dcterms:abstract></sru:recordData><sru:recordPosition>${n}</sru:recordPosition></sru:record>`;
  const r = parseFeed(`<searchRetrieveResponse>${rec("", "1")}${rec(' xmlns:x="urn:x" id=\'a>b\'', "2")}</searchRetrieveResponse>`, "https://v.nl");
  assert.deepEqual(r.map((x) => [x.t, x.l, x.s]), [1, 2].map((n) => [`Titel ${n}`, `https://v.nl/b${n}`, `Wet: Tekst ${n}`]));
  assert.deepEqual(r.map((x) => x.d), [1, 2].map((n) => Date.parse(`2026-01-0${n}T11:00:00Z`)));
}
{
  // recordtag in CDATA of commentaar is tekst, geen nieuw record
  const r = parseFeed('<searchRetrieveResponse><sru:record id="1"><dcterms:title>Een</dcterms:title><x resourceIdentifier="/e"/><dcterms:available>2026-01-01</dcterms:available><dcterms:type>Wet</dcterms:type><dcterms:abstract><![CDATA[Voorbeeld: <sru:record id="x"> tekst]]></dcterms:abstract><!-- <sru:record id="y"> --></sru:record><sru:record><dcterms:title>Twee</dcterms:title><x resourceIdentifier="/t"/><dcterms:available>2026-01-02</dcterms:available></sru:record></searchRetrieveResponse>', "https://v.nl");
  assert.deepEqual(r.map((x) => [x.t, x.l, x.s]), [["Een", "https://v.nl/e", "Wet: Voorbeeld: tekst"], ["Twee", "https://v.nl/t", ": "]]);
  assert.deepEqual(r.map((x) => x.d), [1, 2].map((n) => Date.parse(`2026-01-0${n}T11:00:00Z`)));
}
assert.deepEqual(parseFeed('[{"title":"Bericht","url":"/a","date":"2026-01-02"}]', "https://voorbeeld.nl/feed"), [{ t: "Bericht", l: "https://voorbeeld.nl/a", d: Date.parse("2026-01-02T11:00:00Z"), s: "" }]);
assert.equal(parseFeed('{"vulnerabilities":[{"cveID":"CVE-1","vulnerabilityName":"Lek"}]}', "https://voorbeeld.nl")[0].l, "https://nvd.nist.gov/vuln/detail/CVE-1");
assert.equal(parseFeed('{"hits":{"hits":[{"_id":"123","_source":{"name":"Raad"}}]}}', "https://voorbeeld.nl")[0].t, "Raad");
assert.throws(() => parseFeed("{ongeldig", "https://voorbeeld.nl"), /geen geldige JSON/);
{
  const NS = 'xmlns:atom="http://www.w3.org/2005/Atom"';
  const e = (n: string, extra = "") => `<atom:entry><atom:title>Titel ${n}</atom:title><atom:link rel="self" href="https://v.nl/self${n}"/><atom:link rel="alternate" href="https://v.nl/a${n}"/><atom:published>2026-01-02T10:00:00Z</atom:published><atom:summary>Samenvatting ${n}</atom:summary>${extra}</atom:entry>`;
  const r = parseFeed(`<feed ${NS}>${e("1")}${e("2")}</feed>`, "https://v.nl/feed");
  assert.deepEqual(r, [1, 2].map((n) => ({ t: `Titel ${n}`, l: `https://v.nl/a${n}`, d: Date.parse("2026-01-02T10:00:00Z"), s: `Samenvatting ${n}` })));
  // gemengd: ongeprefixte entry naast prefix-entry
  const g = parseFeed(`<feed ${NS}>${e("1")}<entry><title>Plat</title><link href="https://v.nl/plat"/></entry></feed>`, "https://v.nl/feed");
  assert.deepEqual(g.map((x) => x.t), ["Titel 1", "Plat"]);
  // ander prefix dan de gedeclareerde, en niet-Atom-prefix: geen entry
  assert.deepEqual(parseFeed(`<feed xmlns:foo="http://voorbeeld.nl/x"><foo:entry><foo:title>Nee</foo:title></foo:entry></feed>`, "https://v.nl/feed"), []);
  assert.deepEqual(parseFeed(`<feed ${NS}><x:entry><x:title>Nee</x:title></x:entry></feed>`, "https://v.nl/feed"), []);
  // scope: herdefinitie naar een andere namespace, declaratie buiten scope, herdefinitie terug naar Atom
  const A = "http://www.w3.org/2005/Atom";
  assert.deepEqual(parseFeed(`<root xmlns:a="${A}"><x xmlns:a="urn:anders"><a:entry><a:title>Geen Atom</a:title></a:entry></x></root>`, "https://v.nl/feed"), []);
  assert.deepEqual(parseFeed(`<root><x xmlns:a="${A}"/><a:entry><a:title>Buiten scope</a:title></a:entry></root>`, "https://v.nl/feed"), []);
  assert.deepEqual(parseFeed(`<root xmlns:a="urn:anders"><x xmlns:a="${A}"><a:entry><a:title>Wel</a:title></a:entry></x><a:entry><a:title>Niet</a:title></a:entry></root>`, "https://v.nl/feed").map((x) => x.t), ["Wel"]);
  // gemengde prefixen naar dezelfde namespace: titel, link, datum en samenvatting
  const mix = parseFeed(`<feed><a:entry xmlns:a="${A}" xmlns:b="${A}"><b:title>Titel</b:title><b:link href="https://v.nl/a"/><b:published>2026-01-02T10:00:00Z</b:published><b:summary>Samen</b:summary></a:entry></feed>`, "https://v.nl/feed");
  assert.deepEqual(mix, [{ t: "Titel", l: "https://v.nl/a", d: Date.parse("2026-01-02T10:00:00Z"), s: "Samen" }]);
  // RSS met atom:link blijft werken
  assert.deepEqual(parseFeed(`<rss ${NS}><channel><atom:link href="https://v.nl/feed" rel="self"/><item><title>Rss</title><link>https://v.nl/r</link></item></channel></rss>`, "https://v.nl/feed").map((x) => [x.t, x.l]), [["Rss", "https://v.nl/r"]]);
}
{
  // GUID als bestemming alleen bij permalink (#1381)
  const gl = (guid: string, link = "") => parseFeed(`<rss><item><title>T</title>${link}${guid}</item></rss>`, "https://v.nl/feed")[0].l;
  for (const a of ['isPermaLink="false"', "isPermaLink='false'", 'ispermalink="FALSE"', 'isPermaLink = "false"']) assert.equal(gl(`<guid ${a}>https://v.nl/id/1</guid>`), "", a);
  assert.equal(gl('<guid isPermaLink="true">https://v.nl/a</guid>'), "https://v.nl/a");
  assert.equal(gl("<guid>https://v.nl/b</guid>"), "https://v.nl/b");
  assert.equal(gl('<guid isPermaLink="false">https://v.nl/id/2</guid>', "<link>https://v.nl/echt</link>"), "https://v.nl/echt");
  assert.equal(gl("<guid>urn:uuid:123</guid>"), "");
  // ">" of een nagebootst attribuut binnen een geciteerde waarde (quote-bewust lezen)
  assert.equal(gl('<guid extra=">" isPermaLink="false">https://v.nl/id/3</guid>'), "");
  assert.equal(gl("<guid extra='>' isPermaLink='false'>https://v.nl/id/4</guid>"), "");
  assert.equal(gl(`<guid extra="isPermaLink='false'">https://v.nl/a2</guid>`), "https://v.nl/a2");
}
console.log("✓ parse: feeds, tekst en URL's");
{
  // enclosure-beeld op MIME-type (#1384)
  const img = (e: string) => parseFeed(`<rss><item><title>T</title><link>/a</link>${e}</item></rss>`, "https://v.nl/feed")[0].img;
  assert.equal(img('<enclosure type="image/jpeg" length="1" url="https://c.nl/foto?id=1"/>'), "https://c.nl/foto?id=1");
  assert.equal(img("<enclosure url='https://c.nl/f/2' type='image/png'/>"), "https://c.nl/f/2");
  assert.equal(img('<enclosure url="https://c.nl/f/3" type="image/webp; charset=binary"/>'), "https://c.nl/f/3");
  assert.equal(img('<enclosure type="image/jpeg" url="/f/4"/>'), "https://v.nl/f/4");
  assert.equal(img('<enclosure url="https://c.nl/a.jpg" type="audio/mpeg"/>'), undefined);
  assert.equal(img('<enclosure url="https://c.nl/v" type="video/mp4"/>'), undefined);
  assert.equal(img('<enclosure url="https://c.nl/v" type="image/gif"/>'), undefined);
  assert.equal(img('<enclosure url="https://c.nl/v" type="image/svg+xml"/>'), undefined);
  assert.equal(img('<enclosure url="javascript:alert(1)" type="image/jpeg"/>'), undefined);
  assert.equal(img('<enclosure type="image/jpeg"/>'), undefined);
  assert.equal(img('<enclosure url="https://c.nl/z.png"/>'), "https://c.nl/z.png");
  assert.equal(img('<media:content url="https://c.nl/v.mp4" type="video/mp4"/>'), undefined);
  assert.equal(img('<media:content url="https://c.nl/v.mp4" medium="video"/><media:thumbnail url="https://c.nl/t.jpg"/>'), "https://c.nl/t.jpg");
  // onveilige eerste kandidaat blokkeert een geldige volgende niet
  assert.equal(img('<enclosure url="javascript:alert(1)" type="image/jpeg"/><enclosure url="https://c.nl/g.jpg" type="image/jpeg"/>'), "https://c.nl/g.jpg");
  assert.equal(img('<media:content url="javascript:alert(1)" type="image/jpeg"/><media:thumbnail url="https://c.nl/t2.jpg"/>'), "https://c.nl/t2.jpg");
}
