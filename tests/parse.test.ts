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
// #1373: records met en zonder attributen in één respons, elk veld bij het eigen record
assert.deepEqual(parseFeed('<sru:searchRetrieveResponse><sru:records><sru:record><sru:recordData><dcterms:title>Eerste</dcterms:title><x resourceIdentifier="/een"/><dcterms:available>2026-01-02</dcterms:available><dcterms:type>Wet</dcterms:type><dcterms:abstract>Een</dcterms:abstract></sru:recordData></sru:record><sru:record xmlns:dcterms="urn:x" id="2"><sru:recordData><dcterms:title>Tweede</dcterms:title><x resourceIdentifier="/twee"/><dcterms:type>Besluit</dcterms:type><dcterms:abstract>Twee</dcterms:abstract></sru:recordData></sru:record><sru:record note=\'a>b\'><dcterms:title>Derde</dcterms:title><x resourceIdentifier="/drie"/><dcterms:type>Wet</dcterms:type><dcterms:abstract>Drie</dcterms:abstract></sru:record></sru:records></sru:searchRetrieveResponse>', "https://voorbeeld.nl"), [
  { t: "Eerste", l: "https://voorbeeld.nl/een", d: Date.parse("2026-01-02T11:00:00Z"), s: "Wet: Een" },
  { t: "Tweede", l: "https://voorbeeld.nl/twee", d: null, s: "Besluit: Twee" },
  { t: "Derde", l: "https://voorbeeld.nl/drie", d: null, s: "Wet: Drie" },
]);
assert.deepEqual(parseFeed('[{"title":"Bericht","url":"/a","date":"2026-01-02"}]', "https://voorbeeld.nl/feed"), [{ t: "Bericht", l: "https://voorbeeld.nl/a", d: Date.parse("2026-01-02T11:00:00Z"), s: "" }]);
assert.equal(parseFeed('{"vulnerabilities":[{"cveID":"CVE-1","vulnerabilityName":"Lek"}]}', "https://voorbeeld.nl")[0].l, "https://nvd.nist.gov/vuln/detail/CVE-1");
assert.equal(parseFeed('{"hits":{"hits":[{"_id":"123","_source":{"name":"Raad"}}]}}', "https://voorbeeld.nl")[0].t, "Raad");
assert.throws(() => parseFeed("{ongeldig", "https://voorbeeld.nl"), /geen geldige JSON/);
console.log("✓ parse: feeds, tekst en URL's");
