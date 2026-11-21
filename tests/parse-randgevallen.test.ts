// Randgevallen van de feed-parser (worker/src/parse.ts): entiteiten, dubbel-geëscapete HTML, datums, igTime en Atom/CDATA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { absUrl, decode, igTime, parseFeed, stripHtml } from "../worker/src/parse";

const base = "https://voorbeeld.nl/feed";

// decode: numeriek, hex (kleine en hoofdletter x), hoofdletters in namen en onbekende namen
assert.equal(decode("&#65;&#x41;&#X42;"), "AAB");
assert.equal(decode("&#1114111;&#x10FFFF;&#55295;&#xE000;"), "\u{10FFFF}\u{10FFFF}\uD7FF\uE000");
assert.equal(decode("&#1114112; &#x110000; &#55296; &#xDFFF;"), "&#1114112; &#x110000; &#55296; &#xDFFF;");
assert.equal(decode(`&#${"9".repeat(400)};`), `&#${"9".repeat(400)};`);
assert.equal(decode("&AMP; &Eacute; &Zzz;"), "& é &Zzz;"); // naam hoofdletterongevoelig
assert.equal(decode("&onbekend; &amp;onbekend;"), "&onbekend; &onbekend;");
assert.equal(decode("&amp;amp;"), "&amp;");
assert.equal(decode("zonder ; of & los"), "zonder ; of & los");

const kapotteFeed = parseFeed("<rss><channel><item><title>Kapot &#1114112;</title><link>/kapot</link></item><item><title>Geldig &#x1F600;</title><link>/geldig</link></item></channel></rss>", base);
assert.deepEqual(kapotteFeed.map((e) => e.t), ["Kapot &#1114112;", "Geldig 😀"]);

// stripHtml: dubbel-geëscapete HTML wordt eerst gedecodeerd en dan gestript; script/style verdwijnen
assert.equal(stripHtml("&lt;p&gt;Een &amp;amp; twee&lt;/p&gt;"), "Een & twee");
assert.equal(stripHtml("&lt;script&gt;weg()&lt;/script&gt;Tekst"), "Tekst");
assert.equal(stripHtml("<style>p{color:red}</style><SCRIPT type='x'>a<b</SCRIPT>Zichtbaar"), "Zichtbaar");
assert.equal(stripHtml("<p>Een</p><p>Twee</p>"), "Een Twee");
assert.equal(stripHtml("  veel \n\t witruimte  "), "veel witruimte");

// absUrl: gevaarlijke en ongeldige schema's, relatieve en protocol-relatieve links
assert.equal(absUrl("JavaScript:alert(1)", "https://voorbeeld.nl"), "");
assert.equal(absUrl("data:text/html,x", "https://voorbeeld.nl"), "");
assert.equal(absUrl("../a?b=1#c", "https://voorbeeld.nl/x/y/feed"), "https://voorbeeld.nl/x/a?b=1#c");
assert.equal(absUrl("//cdn.nl/a", "https://voorbeeld.nl"), "https://cdn.nl/a");
assert.equal(absUrl("", "https://voorbeeld.nl"), "");
assert.equal(absUrl(" \t ", base), "");

// datums via parseFeed: alleen een dag (12:00 +01:00), CET en CEST
const rss = (d: string) => parseFeed(`<rss><item><title>T</title><link>/a</link><pubDate>${d}</pubDate></item></rss>`, base)[0].d;
assert.equal(rss("2026-07-01"), Date.parse("2026-07-01T11:00:00Z"));
assert.equal(rss("Fri, 02 Jan 2026 12:00:00 CET"), Date.parse("2026-01-02T11:00:00Z"));
assert.equal(rss("Tue, 01 Jul 2025 12:00:00 CEST"), Date.parse("2025-07-01T10:00:00Z"));
assert.equal(rss(""), null);
assert.equal(rss("onzin"), null);

// igTime: buiten het geldige bereik, of geen shortcode
assert.equal(igTime("https://instagram.com/p/AAAAAAAA/"), 1314220021721); // laagste geldige waarde
assert.equal(igTime("https://instagram.com/p/AAAAAAAA?x=1"), 1314220021721);
assert.equal(igTime("https://instagram.com/p/_______________/"), null); // 15 tekens: geen shortcode
assert.equal(igTime("https://instagram.com/p/____________/"), null); // ver in de toekomst
assert.equal(igTime("https://instagram.com/reel/AAAAAAAA/"), null);
assert.equal(igTime("https://instagram.com/p/AAAAA/"), null); // te kort

// Kittygram: datum komt uit de shortcode, niet uit <updated>
assert.equal(parseFeed('<feed><entry><title>K</title><link href="https://instagram.com/p/AAAAAAAA/"/><updated>2026-01-02T10:00:00Z</updated></entry></feed>', "https://kg.meowing.de/feed")[0].d, 1314220021721);

// RSS met CDATA in titel, link en beschrijving
const r = parseFeed('<rss><channel><item><title><![CDATA[Een &amp; <b>twee</b>]]></title><link><![CDATA[/nieuws?a=1&amp;b=2]]></link><description><![CDATA[<p>Hallo<br/>wereld</p><style>x{}</style>]]></description></item></channel></rss>', base);
assert.deepEqual(r, [{ t: "Een & twee", l: "https://voorbeeld.nl/nieuws?a=1&b=2", d: null, s: "Hallo wereld" }]);

// Atom met meerdere links: alternate wint van self/enclosure; zonder alternate de eerste href
const atom = (links: string) => parseFeed(`<feed><entry><title>A</title>${links}<published>2026-01-02T10:00:00Z</published><summary>Samenvatting</summary></entry></feed>`, base)[0];
const a = atom('<link rel="self" href="https://voorbeeld.nl/self"/><link rel="enclosure" href="https://voorbeeld.nl/x.mp3"/><link rel="alternate" href="https://voorbeeld.nl/echt"/>');
assert.equal(a.l, "https://voorbeeld.nl/echt");
assert.equal(a.d, Date.parse("2026-01-02T10:00:00Z"));
assert.equal(a.s, "Samenvatting");
assert.equal(atom('<link href="/eerste"/><link href="/tweede"/>').l, "https://voorbeeld.nl/eerste");
assert.equal(atom('<link rel="alternate" href="javascript:alert(1)"/>').l, "");
assert.equal(atom("").l, "");
assert.equal(parseFeed('<rss><item><title>A</title><guid>https://voorbeeld.nl/artikel</guid></item></rss>', base)[0].l, "https://voorbeeld.nl/artikel");
assert.equal(parseFeed('<rss><item><title>A</title></item></rss>', base, "/feed").length, 0);
assert.equal(parseFeed('<feed><entry><title>A</title><link href=" "/></entry></feed>', base, "/feed").length, 0);

const json = parseFeed(JSON.stringify([{ title: "A" }, { title: "B", url: " " }, { title: "C", link: "/artikel" }]), base);
assert.deepEqual(json.map((item) => item.l), ["", "", "https://voorbeeld.nl/artikel"]);

// Open Raadsinformatie: onbruikbare treffers mogen geldige treffers niet blokkeren.
const raadHit = { _id: "gemeente/document/123", _source: { name: "Raadsbesluit", start_date: "2026-01-02T10:00:00Z" } };
const raadVerwacht = [{ t: "Raadsbesluit", l: "https://id.openraadsinformatie.nl/gemeente/document/123", d: Date.parse("2026-01-02T10:00:00Z"), s: "" }];
assert.deepEqual(parseFeed(JSON.stringify({ hits: { hits: [raadHit] } }), base), raadVerwacht);
assert.deepEqual(parseFeed(JSON.stringify({ hits: { hits: [null, 42, {}, { _source: {} }, { _id: " ", _source: {} }, { _id: "x", _source: null }, raadHit] } }), base), raadVerwacht);
assert.throws(() => parseFeed('{"hits":', base), /geen geldige JSON/);
// #1368: alternate wint ook als href vóór rel staat, met enkele aanhalingstekens en relatieve URL's
assert.equal(atom('<link rel="self" href="https://voorbeeld.nl/feed"/><link href="/bericht" rel="alternate"/>').l, "https://voorbeeld.nl/bericht");
assert.equal(atom("<link href='https://voorbeeld.nl/feed' rel='self'/><link href='/bericht' rel='alternate'/>").l, "https://voorbeeld.nl/bericht");
assert.equal(atom('<link href="https://voorbeeld.nl/feed" rel="self"/><link href="https://voorbeeld.nl/echt" rel="alternate" type="text/html"/>').l, "https://voorbeeld.nl/echt");
assert.equal(atom('<link href="javascript:alert(1)" rel="alternate"/>').l, "");
// attribuuttekst binnen een andere waarde is geen echt attribuut
assert.equal(atom(`<link href="https://voorbeeld.nl/feed" title="rel='alternate'" rel="self"/><link href="/bericht" rel="alternate"/>`).l, "https://voorbeeld.nl/bericht");
assert.equal(atom(`<link href="https://voorbeeld.nl/feed" title='rel="alternate"' rel="self"/><link href="/bericht" rel="alternate"/>`).l, "https://voorbeeld.nl/bericht");
assert.equal(atom('<link data-href="https://voorbeeld.nl/nep" href="/echt" rel="alternate"/>').l, "https://voorbeeld.nl/echt");

console.log("✓ parse-randgevallen: entiteiten, HTML, datums, igTime, Atom en CDATA");

// Google-news-sitemap (Alarmeringen): titel/tijd uit <news:...>, padfilter, RSS blijft ongemoeid
{
  const xml = readFileSync("tests/fixtures/alarmeringen-sitemap-news.xml", "utf8");
  const url = "https://alarmeringen.nl/sitemap-news.xml";
  const alle = parseFeed(xml, url);
  const kenn = parseFeed(xml, url, "/noord-holland/kennemerland/");
  assert.equal(alle.length, 4);
  assert.equal(kenn.length, 2);
  assert.ok(kenn.every((e) => e.l.includes("/noord-holland/kennemerland/") && e.t && e.d));
  assert.equal(kenn[0].d, Date.parse(/<news:publication_date>([^<]+)</.exec(xml.slice(xml.indexOf("/noord-holland/kennemerland/")))![1]));
  assert.equal(parseFeed(xml, url, "/bestaat-niet/").length, 0);
  // zonder news:publication_date valt het terug op lastmod; zonder titel geen item
  const kaal = parseFeed('<urlset xmlns="x"><url><loc>/a/1</loc><lastmod>2026-10-31T10:00:00+01:00</lastmod><news:news><news:title>Kop &amp; staart</news:title></news:news></url><url><loc>/a/2</loc></url></urlset>', url);
  assert.deepEqual(kaal.map((e) => [e.t, e.l, e.d]), [["Kop & staart", "https://alarmeringen.nl/a/1", Date.parse("2026-10-31T10:00:00+01:00")]]);
  const attributen = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><loc>/nieuws/een?a=1&amp;b=2</loc><news:news><news:title>Eerste &amp; tweede</news:title><news:publication_date>2026-10-31T10:00:00Z</news:publication_date></news:news></url>
    <url><loc>/nieuws/twee</loc><lastmod>2026-11-01T10:00:00Z</lastmod><news:news><news:title>Tweede bericht</news:title></news:news></url>
    <url id="3"><loc>/anders/drie</loc><news:news><news:title>Ander pad</news:title></news:news></url>
    <url id="4"><loc>/nieuws/zonder-titel</loc></url>
    <url id="5"><loc>javascript:alert(1)</loc><news:news><news:title>Ongeldige link</news:title></news:news></url>
    <url id="6"><news:news><news:title>Ontbrekende link</news:title></news:news></url>
    <url-extra><loc>/nieuws/nep</loc><news:news><news:title>Geen URL-element</news:title></news:news></url-extra>
  </urlset>`;
  assert.deepEqual(parseFeed(attributen, url, "/nieuws/").map((e) => [e.t, e.l, e.d]), [
    ["Eerste & tweede", "https://alarmeringen.nl/nieuws/een?a=1&b=2", Date.parse("2026-10-31T10:00:00Z")],
    ["Tweede bericht", "https://alarmeringen.nl/nieuws/twee", Date.parse("2026-11-01T10:00:00Z")],
  ]);
  assert.equal(parseFeed(attributen, url).length, 3);
  // RSS past het padfilter sinds #455 ook toe
  assert.equal(parseFeed('<rss><channel><item><title>A</title><link>https://x.nl/a</link></item></channel></rss>', base, "/zzz/").length, 0);
  assert.equal(parseFeed('<rss><channel><item><title>A</title><link>https://x.nl/zzz/a</link></item></channel></rss>', base, "/zzz/").length, 1);
}
console.log("✓ parse-randgevallen: Google-news-sitemap met padfilter");

// #1371: onbruikbare records in JSON-feeds worden overgeslagen, geldige blijven
{
  const kev = JSON.stringify({ vulnerabilities: [null, 5, "x", [], { cveID: "CVE-2026-1", vulnerabilityName: "Lek", dateAdded: "2026-10-01", shortDescription: "Uitleg" }] });
  const k = parseFeed(kev, base);
  assert.equal(k.length, 1);
  assert.equal(k[0].t, "CVE-2026-1: Lek");
  assert.equal(k[0].l, "https://nvd.nist.gov/vuln/detail/CVE-2026-1");
  const raad = parseFeed(JSON.stringify({ hits: { hits: [null, "x", { _id: "7", _source: { name: "Raad", start_date: "2026-10-01" } }] } }), base);
  assert.deepEqual(raad.map((e) => [e.t, e.l]), [["Raad", "https://id.openraadsinformatie.nl/7"]]);
  const arr = parseFeed(JSON.stringify([null, 3, [1], { title: "Goed", url: "https://x.nl/a", date: "2026-10-01" }]), base);
  assert.deepEqual(arr.map((e) => [e.t, e.l]), [["Goed", "https://x.nl/a"]]);
  assert.throws(() => parseFeed("[{kapot", base), /geen geldige JSON/);
}
console.log("✓ parse-randgevallen: JSON-feeds met onbruikbare records");

// #1379: het padfilter geldt ook voor JSON-formaten; zonder pad blijft alles staan
{
  const kev = JSON.stringify({ vulnerabilities: [{ cveID: "CVE-1", vulnerabilityName: "A", dateAdded: "2026-01-01" }, { cveID: "", vulnerabilityName: "B" }] });
  assert.equal(parseFeed(kev, base).length, 2);
  assert.deepEqual(parseFeed(kev, base, "/vuln/detail/CVE-1").map((e) => e.l), ["https://nvd.nist.gov/vuln/detail/CVE-1"]);
  assert.equal(parseFeed(kev, base, "/andere/").length, 0);
  const ori = JSON.stringify({ hits: { hits: [{ _id: "ori/1", _source: { name: "A" } }, { _id: "x/2", _source: { name: "B" } }, { _id: "", _source: { name: "C" } }] } });
  assert.equal(parseFeed(ori, base).length, 2); // hit zonder geldige _id valt altijd af (#1383)
  assert.deepEqual(parseFeed(ori, base, "/ori/").map((e) => e.l), ["https://id.openraadsinformatie.nl/ori/1"]);
  // breed filter: records zonder (of met lege) id vallen af, een geldig record blijft
  const kev2 = JSON.stringify({ vulnerabilities: [{ cveID: "CVE-1", vulnerabilityName: "A" }, { cveID: "", vulnerabilityName: "B" }, { vulnerabilityName: "C" }] });
  assert.equal(parseFeed(kev2, base).length, 3);
  assert.deepEqual(parseFeed(kev2, base, "/vuln/detail/").map((e) => e.l), ["https://nvd.nist.gov/vuln/detail/CVE-1"]);
  const ori2 = JSON.stringify({ hits: { hits: [{ _id: "ori/1", _source: { name: "A" } }, { _id: "", _source: { name: "B" } }, { _source: { name: "C" } }] } });
  assert.equal(parseFeed(ori2, base).length, 1); // idem (#1383)
  assert.deepEqual(parseFeed(ori2, base, "/").map((e) => e.l), ["https://id.openraadsinformatie.nl/ori/1"]);
  const arr = JSON.stringify([{ title: "A", url: "/nieuws/a" }, { title: "B", url: "/sport/b" }, { title: "C" }, { title: "D", url: "http://" }]);
  assert.equal(parseFeed(arr, base).length, 4);
  assert.deepEqual(parseFeed(arr, base, "/nieuws/").map((e) => e.t), ["A"]);
}
console.log("✓ parse-randgevallen: padfilter voor JSON-formaten");
