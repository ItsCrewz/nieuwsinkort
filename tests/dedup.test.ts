// Draai: npm run test  (bundelt met esbuild en draait met node)
import assert from "node:assert/strict";
import { dedupVideos, canonUrl, videoKeys, titleTokens } from "../src/dedup";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => {
  const klaar = () => { n++; console.log("✓", name); };
  const resultaat = fn();
  if (resultaat instanceof Promise) return resultaat.then(klaar);
  klaar();
};

t("tracking-parameters weg", () => {
  assert.equal(canonUrl("https://www.youtube.com/shorts/abcdefghijk?si=XYZ&feature=share"), "youtube.com/shorts/abcdefghijk");
  assert.equal(canonUrl("https://twitter.com/NOS/status/123?s=20&t=abc"), "x.com/NOS/status/123?t=abc");
  assert.equal(canonUrl("https://www.instagram.com/reel/C0de123/?igsh=MWQ1&utm_source=ig_web"), "instagram.com/reel/C0de123");
});

t("zelfde YouTube-id in shorts/watch/embed/youtu.be", () => {
  const ids = ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?si=1", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"];
  for (const h of ids) assert.ok(videoKeys({ titel: "x", href: h, bron: "YouTube" }).includes("yt:dQw4w9WgXcQ"), h);
  const r = dedupVideos(ids.map((href, i) => ({ titel: `Titel ${i}`, href, bron: "YouTube" })));
  assert.equal(r.list.length, 1);
  assert.equal(r.removed, 3);
});

t("Instagram p/ en reel/ zelfde shortcode", () => {
  const r = dedupVideos([
    { titel: "Reel A", href: "https://www.instagram.com/reel/ABC123xyz/", bron: "Instagram", embed: "https://scontent.cdninstagram.com/v/t66/abc.mp4?oe=1" },
    { titel: "Andere titel", href: "https://instagram.com/p/ABC123xyz/?igsh=1", bron: "Instagram" },
  ]);
  assert.equal(r.list.length, 1);
});

t("zelfde clip op twee platforms via bijna-gelijke titel; beste (afspeelbaar) blijft, ander in 'ook'", () => {
  const r = dedupVideos([
    { titel: "Brand in Haarlemse binnenstad: brandweer rukt groots uit #nieuws", href: "https://www.instagram.com/reel/QQQ111/", bron: "Instagram", embed: "https://x.cdninstagram.com/v.mp4?oe=1", populariteit: "120 likes" },
    { titel: "Brand in Haarlemse binnenstad, brandweer rukt groots uit | NH Nieuws", href: "https://www.youtube.com/shorts/aaaaaaaaaaa", bron: "YouTube", embed: "https://www.youtube.com/embed/aaaaaaaaaaa", populariteit: "5,1k views" },
  ]);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].bron, "YouTube");
  assert.deepEqual((r.list[0] as any).ook, [{ bron: "Instagram", href: "https://www.instagram.com/reel/QQQ111/" }]);
});

t("verschillende filmpjes blijven", () => {
  const r = dedupVideos([
    { titel: "Kabinet presenteert plannen voor woningbouw in 2027", href: "https://youtu.be/aaaaaaaaaa1", bron: "YouTube" },
    { titel: "Ajax verliest van PSV in spannende topper", href: "https://youtu.be/aaaaaaaaaa2", bron: "YouTube" },
    { titel: "Kat", href: "https://v.redd.it/abc", bron: "Reddit" },
    { titel: "Kat", href: "https://v.redd.it/def", bron: "Reddit" }, // korte gelijke titel ≠ zelfde filmpje
  ]);
  assert.equal(r.list.length, 4);
});

t("filmpje dat al bij Dumpert staat valt uit Filmpjes", () => {
  const d = [{ titel: "Gozer valt van fiets", href: "https://www.dumpert.nl/item/100_abc", bron: "Dumpert" }];
  const r = dedupVideos([{ titel: "Iets", href: "https://dumpert.nl/item/100_abc?ref=x", bron: "Reddit" }, { titel: "Anders", href: "https://youtu.be/bbbbbbbbbbb", bron: "YouTube" }], d);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].bron, "YouTube");
});

t("X-status en mp4-pad zonder query", () => {
  const r = dedupVideos([
    { titel: "a", href: "https://x.com/NOS/status/1850000000000000000", bron: "X" },
    { titel: "b", href: "https://twitter.com/NOS/status/1850000000000000000?s=46", bron: "X" },
    { titel: "c", href: "https://site/1", embed: "https://video.twimg.com/amplify_video/123/vid/720x1280/x.mp4?tag=14", bron: "X" },
    { titel: "d", href: "https://site/2", embed: "https://video.twimg.com/amplify_video/123/vid/720x1280/x.mp4?tag=16", bron: "X" },
  ]);
  assert.equal(r.list.length, 2);
});

t("titel-tokens: bron-achtervoegsel, hashtags, emoji weg", () => {
  assert.deepEqual(titleTokens("Storm raast over Nederland 🌪️ #storm | RTL Nieuws"), ["storm", "raast", "nederland"]);
});

const live46 = [
  {
    "titel": "Dit gebeurde donderdagmiddag.",
    "ai": "De man is na zijn aanhouding meegenomen naar het politiebureau en heeft meerdere bekeuringen gekregen. Inmiddels is hij weer op vrije…",
    "href": "https://www.instagram.com/reel/DfHS9x8D8uK/",
    "tijd": "10:49",
    "bron": "Instagram"
  },
  {
    "titel": "Agent tasert bezorger na verkeerd parkeren",
    "ai": "Dit gebeurde donderdagmiddag. De man is na zijn aanhouding meegenomen naar het politiebureau en heeft meerdere bekeuringen gekregen.…",
    "href": "https://www.youtube.com/shorts/pUO-QxCiapA",
    "tijd": "10:47",
    "bron": "YouTube"
  },
  {
    "titel": "De beelden van de mishandeling in Beverwijk vorig jaar verspreidden zich razendsnel via sociale media en…",
    "ai": "De beelden van de mishandeling in Beverwijk vorig jaar verspreidden zich razendsnel via sociale media en veroorzaakten veel onrust in de…",
    "href": "https://www.instagram.com/reel/DfG5Y2UgaiS/",
    "tijd": "07:06",
    "bron": "Instagram"
  },
  {
    "titel": "Twee jaar cel voor mishandeling",
    "ai": "De beelden van de mishandeling in Beverwijk vorig jaar verspreidden zich razendsnel via sociale media en veroorzaakten veel onrust in de…",
    "href": "https://www.youtube.com/shorts/rZ4yboa9LR0",
    "tijd": "07:06",
    "bron": "YouTube"
  },
  {
    "titel": "Het constructieve aanbod van JA21, SGP en BBB gaat niet alleen over het belastingplan, maar óók over de…",
    "ai": "Het constructieve aanbod van JA21, SGP en BBB gaat niet alleen over het belastingplan, maar óók over de begrotingen. We bieden steun in…",
    "href": "https://www.instagram.com/reel/DfHXUJCN3Dv/",
    "tijd": "11:27",
    "bron": "Instagram"
  },
  {
    "titel": "JA21, SGP en BBB over hun constructieve bod aan het kabinet",
    "ai": "Het constructieve aanbod van JA21, SGP en BBB gaat over het belastingplan én over de begrotingen. Logisch om daarom óók iets te vinden…",
    "href": "https://www.youtube.com/watch?v=zBjezjqlL-Y",
    "tijd": "11:03",
    "bron": "YouTube"
  },
  {
    "titel": "We moeten af van de stikstofnormen zodat vergunningen weer kunnen worden afgegeven en boeren hun werk…",
    "ai": "We moeten af van de stikstofnormen zodat vergunningen weer kunnen worden afgegeven en boeren hun werk kunnen blijven doen. FVD is de…",
    "href": "https://www.instagram.com/reel/DfHQru_NxMB/",
    "tijd": "10:30",
    "bron": "Instagram"
  },
  {
    "titel": "Voorzitter agractie sluit acties tegen stikstofplan niet uit",
    "ai": "Boeren in heel Nederland wachtten vrijdagochtend in spanning de aangepaste stikstofplannen van landbouwminister Jaimi van Essen af.…",
    "href": "https://www.youtube.com/shorts/DinaGEQUV_c",
    "tijd": "11:41",
    "bron": "YouTube"
  }
];
t("caption: echte dubbele shorts behouden de beste bron en ook", () => {
  for (const [a, b] of [[0, 1], [2, 3]]) {
    const r = dedupVideos([live46[a], live46[b]]);
    assert.equal(r.list.length, 1);
    assert.equal(r.list[0].href, live46[b].href);
    assert.deepEqual((r.list[0] as any).ook, [{ bron: "Instagram", href: live46[a].href }]);
  }
});
t("caption: verschillende video's over hetzelfde onderwerp blijven apart", () => {
  for (const [a, b] of [[4, 5], [6, 7]]) assert.equal(dedupVideos([live46[a], live46[b]]).list.length, 2);
  const basis = { bron: "YouTube", titel: "Eerste opname van een gebeurtenis", href: "https://youtu.be/aaaaaaaaaaa", tijd: "10:00", ai: "Bekijk hier de beelden van het laatste nieuws vandaag. De politie hield een verdachte aan." };
  const ander = { ...basis, titel: "Tweede opname van een gebeurtenis", href: "https://youtu.be/bbbbbbbbbbb", ai: "Bekijk hier de beelden van het laatste nieuws vandaag. De brandweer bluste een grote brand." };
  assert.equal(dedupVideos([basis, ander]).list.length, 2);
  assert.equal(dedupVideos([{ ...basis, ai: "Kijk mee 👀 #nieuws" }, { ...ander, ai: "Kijk mee #nieuws" }]).list.length, 2);
  assert.equal(dedupVideos([live46[0], { ...live46[1], tijd: "18:00" }]).list.length, 2);
  assert.equal(dedupVideos([live46[0], { ...live46[1], tijd: "" }]).list.length, 2);
  assert.equal(dedupVideos([{ ...live46[0], _pub: 100000000 }, { ...live46[1], _pub: 100000000 + 181 * 60000 }]).list.length, 2);
  assert.equal(dedupVideos([live46[0]], [live46[1]]).list.length, 0);
});

t("caption-cache: zelfde uitkomst bij herhaling en na wijziging van titel/ai (#404)", () => {
  const ai = "Bekijk hier de beelden van het laatste nieuws vandaag. De politie hield een verdachte aan in de binnenstad.";
  const a: any = { bron: "YouTube", titel: "Eerste opname", href: "https://youtu.be/aaaaaaaaaaa", tijd: "10:00", ai };
  const b: any = { bron: "TikTok", titel: "Tweede opname", href: "https://youtu.be/bbbbbbbbbbb", tijd: "10:05", ai };
  assert.equal(dedupVideos([a, b]).list.length, 1);
  assert.equal(dedupVideos([a, b]).list.length, 1);
  b.ai = "Totaal andere tekst over de brandweer die een grote brand bluste in het centrum van de stad vandaag.";
  assert.equal(dedupVideos([a, b]).list.length, 2);
  b.ai = ai;
  assert.equal(dedupVideos([a, b]).list.length, 1);
});

console.log(`\n${n} tests geslaagd`);
