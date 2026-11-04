// Randgevallen van de feed-parser (worker/src/parse.ts): entiteiten, dubbel-geëscapete HTML, datums, igTime en Atom/CDATA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { absUrl, decode, igTime, parseFeed, stripHtml } from "../worker/src/parse";

const base = "https://voorbeeld.nl/feed";

// decode: numeriek, hex (kleine en hoofdletter x), hoofdletters in namen en onbekende namen
assert.equal(decode("&#65;&#x41;&#X42;"), "AAB");
assert.equal(decode("&AMP; &Eacute; &Zzz;"), "& é &Zzz;"); // naam hoofdletterongevoelig
assert.equal(decode("&onbekend; &amp;onbekend;"), "&onbekend; &onbekend;");
assert.equal(decode("&amp;amp;"), "&amp;");
assert.equal(decode("zonder ; of & los"), "zonder ; of & los");

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
assert.equal(absUrl("", "https://voorbeeld.nl"), "https://voorbeeld.nl/");

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
  // RSS past het padfilter sinds #455 ook toe
  assert.equal(parseFeed('<rss><channel><item><title>A</title><link>https://x.nl/a</link></item></channel></rss>', base, "/zzz/").length, 0);
  assert.equal(parseFeed('<rss><channel><item><title>A</title><link>https://x.nl/zzz/a</link></item></channel></rss>', base, "/zzz/").length, 1);
}
console.log("✓ parse-randgevallen: Google-news-sitemap met padfilter");
