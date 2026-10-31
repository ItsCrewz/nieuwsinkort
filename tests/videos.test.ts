import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { parseDumpert, parseRedditVideos, parseYouTube, soortVan, selecteerFilmpjes, ytGeblokkeerdeShorts, ytBlokkades, YT_NIEUWS } from "../worker/src/videos";
import { videoKeys } from "../src/dedup";
import { vanVandaag } from "../src/vandaag";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
let n = 0;
const t = async (naam: string, fn: () => Promise<void>) => { await fn(); n++; console.log("✓", naam); };
await t("socials krijgen plaats binnen de plafonds en behouden scorevolgorde", async () => {
  const videos = [
    ...Array.from({ length: 22 }, (_, i) => ({ bron: "YouTube", soort: "short", id: `s${i}` })),
    ...Array.from({ length: 16 }, (_, i) => ({ bron: "YouTube", soort: "journaal", id: `j${i}` })),
    { bron: "Reddit", soort: "short", id: "r" }, { bron: "X", soort: "journaal", id: "x" },
    ...Array.from({ length: 5 }, (_, i) => ({ bron: "Instagram", soort: "short", id: `i${i}` })),
  ];
  const gekozen = selecteerFilmpjes(videos);
  assert.equal(gekozen.filter((v) => v.soort === "short").length, 18);
  assert.equal(gekozen.filter((v) => v.soort === "journaal").length, 14);
  assert.deepEqual(gekozen.filter((v) => v.bron !== "YouTube").map((v) => v.id), ["r", "i0", "i1", "x"]);
  for (const soort of ["short", "journaal"]) {
    assert.deepEqual(gekozen.filter((v) => v.soort === soort), videos.filter((v) => v.soort === soort && gekozen.includes(v)));
  }
});
await t("Reddit-Atom levert alleen afspeelbare video's met herkenbare sleutels", async () => {
  const entry = (id: string, content: string, media = "") => `<entry><title>Video ${id}</title><link href="https://www.reddit.com/r/Netherlands/comments/${id}/titel/"/><published>2026-10-30T10:00:00Z</published>${media}<content type="html">${content}</content></entry>`;
  const link = (url: string) => `&lt;a href=&quot;${url}&quot;&gt;link&lt;/a&gt;`;
  const xml = [
    entry("abc123", link("https://v.redd.it/vid123"), '<media:thumbnail url="https://preview.redd.it/foto.jpg?width=200&amp;format=webp"/>'),
    entry("def456", link("https://youtu.be/NVZiFWIqU48?si=abc")),
    entry("ghi789", link("https://www.youtube.com/shorts/NVZiFWIqU48")),
    entry("jkl123", link("https://streamable.com/abc")),
    entry("mno456", link("https://v.redd.it/vid456") + '&lt;img src=&quot;https://external-preview.redd.it/foto.jpg?width=100&amp;amp;format=webp&quot; /&gt;'),
    entry("pqr789", link("https://www.youtube.com/watch?feature=share&amp;amp;v=NVZiFWIqU48")),
  ].join("");
  const videos = parseRedditVideos(xml, "Netherlands", 0, () => "11:00");
  assert.equal(videos.length, 5);
  assert.equal(videos[0].embed, "https://v.redd.it/vid123/HLSPlaylist.m3u8");
  assert.equal(videos[0].thumb, "https://preview.redd.it/foto.jpg?width=200&format=webp");
  assert.ok(videoKeys(videos[0]).includes("rd:abc123"));
  assert.ok(videoKeys(videos[0]).includes("vr:vid123"));
  assert.equal(videos[1].embed, "https://www.youtube-nocookie.com/embed/NVZiFWIqU48?autoplay=1&rel=0");
  assert.equal(videos[1].thumb, "https://i.ytimg.com/vi/NVZiFWIqU48/hqdefault.jpg");
  assert.ok(videoKeys(videos[1]).includes("rd:def456"));
  assert.ok(videoKeys(videos[1]).includes("yt:NVZiFWIqU48"));
  assert.equal(soortVan(videos[1]), "journaal");
  assert.equal(soortVan(videos[2]), "short");
  assert.equal(videos[3].thumb, "https://external-preview.redd.it/foto.jpg?width=100&format=webp");
  assert.equal(videos[4].embed, videos[1].embed);
});
await t("YouTube-nieuwskanalen bevatten de nieuwe kanalen", async () => {
  assert.equal(YT_NIEUWS["NOS Stories"], "UCoakeH4bmdUYtptWdmoUrRQ");
  assert.equal(YT_NIEUWS["Nieuwsuur"], "UCExcZNwh_3Mwm4fF4VSiu2w");
  assert.equal(YT_NIEUWS["Omroep PowNed"], "UCihqgpWn_ns1gJUdhNLsSMQ");
  assert.equal(YT_NIEUWS["Radar"], "UCGUhzuD1eYIgJoSGe0c_rNg");
});
await t("YouTube-Short krijgt een embed en de soort short", async () => {
  const xml = `<feed><entry><yt:videoId>abcdefghijk</yt:videoId><title>Kort nieuws</title><link rel="alternate" href="https://www.youtube.com/shorts/abcdefghijk"/><published>2026-10-29T12:00:00Z</published></entry></feed>`;
  const videos = parseYouTube(xml, "NOS Stories", Date.parse("2026-10-28T00:00:00Z"), () => "13:00");
  assert.equal(videos.length, 1);
  assert.equal(videos[0].embed, "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0");
  assert.equal(soortVan(videos[0]), "short");
});
await t("F1-Shorts worden ondanks een speelbare cache geblokkeerd, lange video's blijven staan", async () => {
  const entry = (id: string, pad: string) => `<entry><yt:videoId>${id}</yt:videoId><title>Video</title><link rel="alternate" href="https://www.youtube.com/${pad}/${id}"/><published>2026-10-29T12:00:00Z</published></entry>`;
  const f1 = parseYouTube(entry("gmkJBKiE77Q", "shorts") + entry("oCN0cP1RnFc", "shorts") + entry("abcdefghijk", "watch"), "FORMULA 1", 0, () => "13:00");
  const ander = parseYouTube(entry("12345678901", "shorts"), "NOS Sport", 0, () => "13:00");
  const ids = ytGeblokkeerdeShorts([...f1, ...ander]);
  assert.deepEqual(ids, ["gmkJBKiE77Q", "oCN0cP1RnFc"]);
  const cache = { gmkJBKiE77Q: { geblokkeerd: false, at: Date.now() } };
  const geblokkeerd = ytBlokkades([...ids, "abcdefghijk", "12345678901"], ids, cache);
  assert.deepEqual(geblokkeerd, ids);
  assert.deepEqual(selecteerFilmpjes([...f1, ...ander].filter((v) => !geblokkeerd.some((id) => v.embed?.includes(id))).map((v) => ({ ...v, soort: soortVan(v) }))).map((v) => v.href), [ander[0].href, f1[2].href]);
});
await t("Sport- en autokanalen en NOS Sport-Short", async () => {
  assert.equal(YT_NIEUWS["NOS Sport"], "UCT4oPufBQa0f6C67Fw_HXNg");
  assert.equal(YT_NIEUWS["Ziggo Sport"], "UCueOZEvMffxjJyVO1fGiJNQ");
  assert.equal(YT_NIEUWS["ESPN NL"], "UCXnPiEv1DoUCDAqDUXT9shQ");
  assert.equal(YT_NIEUWS["OnsOranje"], "UCpnmJcBhJqKIHFkKvgdkdMQ");
  assert.equal(YT_NIEUWS["FORMULA 1"], "UCB_qr75-ydFVKSF9Dmo6izg");
  assert.equal(YT_NIEUWS["AutoWeek"], "UCzToShYR6Sw_k1i6FsdEr6g");
  assert.equal(YT_NIEUWS["Autovisie"], "UCAkqAwuyz_qu3vfgAMQPCBw");
  const xml = `<feed><entry><yt:videoId>abcdefghijk</yt:videoId><title>Sport</title><link rel="alternate" href="https://www.youtube.com/shorts/abcdefghijk"/><published>2026-10-29T12:00:00Z</published></entry></feed>`;
  const videos = parseYouTube(xml, "NOS Sport", Date.parse("2026-10-28T00:00:00Z"), () => "13:00");
  assert.equal(videos.length, 1);
  assert.equal(videos[0].embed, "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0");
  assert.equal(soortVan(videos[0]), "short");
});

// ---- Dumpert: toppers + latest uit dezelfde pagina (#394)
const dItem = (id: number, pub: string, extra: Record<string, unknown> = {}) => ({
  id: `${id}_abc`, title: `Clip ${id}`, description: "<p>tekst</p>", published_at: pub, nsfw: false, partner_content: false, secret: false,
  thumbnail: `https://media.dumpert.nl/${id}/thumb.png`, stats: { views_today: 100 + id, kudos_today: id % 50 },
  media: [{ mediatype: "VIDEO", variants: [{ version: "tablet", uri: `https://media.dumpert.nl/${id}/480/index.m3u8` }] }], ...extra,
});
const dHtml = (lijsten: Record<string, unknown[]>) => {
  const state = Object.fromEntries(Object.entries(lijsten).map(([k, items]) => [k, { data: { result: { data: { items } } } }]));
  return `<script>window.__DUMPERT_CONTEXT__ = JSON.parse(${JSON.stringify(JSON.stringify({ state }))});</script>`;
};
const TOP = "getItemsList-list=toppers,nsfwActive=true,page=0", LAT = "getItemsList-list=latest,nsfwActive=true,page=0";
const dNu = Date.parse("2026-10-31T10:00:00Z"), dHhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
const gisteren = (id: number) => ({ ...dItem(id, "2026-10-30T15:00:00Z") });
await t("Dumpert: toppers van gisteren + latest van vandaag levert items van vandaag", async () => {
  const html = dHtml({ [TOP]: [gisteren(1), gisteren(2)], [LAT]: [dItem(10, "2026-10-31T09:30:00Z"), dItem(11, "2026-10-31T08:00:00Z")] });
  const alle = parseDumpert(html, dHhmm);
  assert.equal(alle.length, 4);
  const vandaag = alle.filter((v) => vanVandaag(v._pub, dNu));
  assert.deepEqual(vandaag.map((v) => v.href).sort(), ["https://www.dumpert.nl/item/10_abc", "https://www.dumpert.nl/item/11_abc"]);
});
await t("Dumpert: item in beide lijsten komt één keer voor, toppers wint", async () => {
  const top = dItem(5, "2026-10-31T07:00:00Z", { title: "Uit toppers" });
  const lat = dItem(5, "2026-10-31T07:00:00Z", { title: "Uit latest" });
  const alle = parseDumpert(dHtml({ [TOP]: [top], [LAT]: [lat, dItem(6, "2026-10-31T07:30:00Z")] }), dHhmm);
  assert.equal(alle.length, 2);
  assert.equal(alle.find((v) => v.href.endsWith("/5_abc"))!.titel, "Uit toppers");
});
await t("Dumpert: nsfw, partner en secret in latest vallen weg; geen views_today ook", async () => {
  const alle = parseDumpert(dHtml({ [TOP]: [], [LAT]: [
    dItem(20, "2026-10-31T09:00:00Z", { nsfw: true }), dItem(21, "2026-10-31T09:00:00Z", { partner_content: true }),
    dItem(22, "2026-10-31T09:00:00Z", { secret: true }), dItem(23, "2026-10-31T09:00:00Z", { stats: { views_today: 0 } }),
    dItem(24, "2026-10-31T09:00:00Z", { media: [] }), dItem(25, "2026-10-31T09:00:00Z"),
  ] }), dHhmm);
  assert.deepEqual(alle.map((v) => v.href), ["https://www.dumpert.nl/item/25_abc"]);
});
await t("Dumpert: ontbrekende latest-lijst werkt, ontbrekende toppers gebruikt latest, beide weg geeft fout", async () => {
  assert.equal(parseDumpert(dHtml({ [TOP]: [gisteren(1)] }), dHhmm).length, 1);
  assert.equal(parseDumpert(dHtml({ [LAT]: [dItem(10, "2026-10-31T09:30:00Z")] }), dHhmm).length, 1);
  assert.throws(() => parseDumpert(dHtml({ overig: [] }), dHhmm), /geen toppers-lijst/);
});
await t("Dumpert: sortering op kudos vandaag blijft over beide lijsten", async () => {
  const alle = parseDumpert(dHtml({ [TOP]: [dItem(3, "2026-10-30T15:00:00Z")], [LAT]: [dItem(40, "2026-10-31T09:00:00Z")] }), dHhmm);
  assert.deepEqual(alle.map((v) => v._score), [40, 3]);
});

console.log(`\n${n} video-tests geslaagd`);
