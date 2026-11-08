import assert from "node:assert/strict";
import { dedupVideos, videoKeys, type DVideo } from "../../src/dedup";

// Representatieve URL's: verschillende berichten delen een media- of afbeeldingsendpoint.
for (const veld of ["embed", "thumb"] as const) {
  const pad = veld === "embed" ? "https://media.example/video.mp4" : "https://media.example/afbeelding";
  const video = (id: string, tracking: string, nummer: number): DVideo => ({
    titel: `Bericht ${nummer}`, href: `https://voorbeeld.example/bericht/${nummer}`, bron: "Voorbeeld",
    [veld]: `${pad}?id=${id}&utm_source=${tracking}`,
  });
  const a = video("AbC", "een", 1);
  const b = video("abc", "twee", 2);
  const gelijk = video("AbC", "twee", 3);
  const sleutel = (v: DVideo) => videoKeys(v).find((k) => k.startsWith(veld === "embed" ? "media:" : "thumb:"));
  assert.notEqual(sleutel(a), sleutel(b));
  assert.equal(sleutel(a), sleutel(gelijk));
  assert.equal(dedupVideos([a, b]).list.length, 2);
  assert.equal(dedupVideos([a, gelijk]).list.length, 1);
  assert.equal(dedupVideos([a], [b]).list.length, 1);
  assert.equal(dedupVideos([a], [gelijk]).list.length, 0);
}

// Escaping van querywaarden mag geen sleutelbotsing veroorzaken.
const basis: DVideo = { titel: "Een", href: "https://voorbeeld.example/een", bron: "Voorbeeld" };
const sleutel = (thumb: string) => videoKeys({ ...basis, thumb }).find((k) => k.startsWith("thumb:"));
assert.notEqual(sleutel("https://media.example/beeld?id=a%26b%3Dc"), sleutel("https://media.example/beeld?id=a&b=c"));
console.log("✓ media- en thumbnailquery's behouden betekenisvolle waarden (#847)");
