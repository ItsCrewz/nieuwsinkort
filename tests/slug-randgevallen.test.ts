// Randgevallen van videoSlug(): YouTube-varianten, platformvolgorde en titelterugval.
import assert from "node:assert/strict";
import { videoSlug } from "../src/slug";
import type { Video } from "../src/types";
const video = (href: string, titel = "Titel", embed = ""): Video => ({ href, titel, embed, ai: "", bron: "", thumb: "", populariteit: "", tijd: "" });
const slug = (href: string, titel?: string, embed?: string) => videoSlug(video(href, titel, embed));

// YouTube: embed wint van href, ook als href een ander platform is
assert.equal(slug("https://youtube.com/watch?v=hrefHREF123", "T", "https://www.youtube.com/embed/embedEMB123"), "yt-embedEMB123");
assert.equal(slug("https://youtu.be/hrefHREF123", "T", "https://dumpert.nl/embed/x"), "yt-hrefHREF123");
assert.equal(slug("https://x.com/a/status/9", "T", "https://www.youtube-nocookie.com/embed/nocookie_12"), "yt-nocookie_12");
// youtu.be, shorts, live en watch met extra parameters
assert.equal(slug("https://youtu.be/abcDEF12345?si=xyz&t=10"), "yt-abcDEF12345");
assert.equal(slug("https://www.youtube.com/shorts/abc-DEF_123?feature=share"), "yt-abc-DEF_123");
assert.equal(slug("https://www.youtube.com/live/liveID12345?si=a"), "yt-liveID12345");
assert.equal(slug("https://www.youtube.com/watch?v=abcDEF12345&list=PL1&t=5"), "yt-abcDEF12345");
assert.equal(slug("https://www.youtube.com/watch?feature=x&v=abcDEF12345"), "yt-abcDEF12345");
assert.equal(slug("https://m.youtube.com/watch?v=abcDEF12345"), "yt-abcDEF12345");
// Te korte id of onbekend pad: geen YouTube, terugval op titel
assert.equal(slug("https://youtu.be/abc", "Korte id"), "korte-id");
assert.equal(slug("https://www.youtube.com/watch?x=abcDEF12345", "Geen v"), "geen-v");
assert.equal(slug("https://www.youtube.com/channel/abcDEF12345", "Kanaal"), "kanaal");
// Dumpert, X, Reddit, Instagram
assert.equal(slug("https://www.dumpert.nl/item/1234_abcd?x=1"), "d-1234_abcd");
assert.equal(slug("https://twitter.com/u/status/1234567890/video/1"), "x-1234567890");
assert.equal(slug("https://x.com/u/status/abc", "Geen cijfers"), "geen-cijfers");
assert.equal(slug("https://www.reddit.com/r/Nederlands_1/comments/1abcde/titel/"), "r-1abcde");
assert.equal(slug("https://www.reddit.com/r/test/", "Geen post"), "geen-post");
assert.equal(slug("https://www.instagram.com/reel/Cx-1_2/?igsh=a"), "ig-Cx-1_2");
assert.equal(slug("https://www.instagram.com/p/Bx9_z/"), "ig-Bx9_z");
assert.equal(slug("https://www.instagram.com/tv/Bx9_z/", "Tv"), "tv");
// Volgorde: dumpert gaat voor X-statuspad
assert.equal(slug("https://dumpert.nl/item/a1/status/5"), "d-a1");
// Titelterugval
assert.equal(slug("", ""), "video");
assert.equal(slug("", "   "), "video");
assert.equal(slug("", "Ça va? Crème brûlée à l'île"), "ca-va-creme-brulee-a-l-ile");
assert.equal(slug("", "  --Hallo   Wereld--  "), "hallo-wereld");
assert.equal(slug("", "日本語"), "video");
assert.equal(slug("", "x".repeat(200)), "x".repeat(60));
const lang = slug("", `${"ab ".repeat(30)}einde`);
assert.ok(lang.length <= 60);
assert.equal(slug("https://example.com/video", "Gewone Titel 2024"), "gewone-titel-2024");
console.log("✓ slug-randgevallen");
