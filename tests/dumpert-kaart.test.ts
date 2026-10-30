import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Video } from "../src/types";

Object.assign(globalThis, { window: { location: { href: "https://example.nl/" }, localStorage: { getItem: () => null } } });
const { playerFor } = await import("../src/video");

const v: Video = { titel: "Een filmpje", bron: "Dumpert", href: "https://www.dumpert.nl/item/123", embed: "https://media.dumpert.nl/video/test.m3u8", thumb: "https://img.example/foto.jpg", ai: "", tijd: "", populariteit: "" };
assert.equal(playerFor(v), null);
assert.equal(playerFor({ ...v, embed: "https://media.dumpert.nl/video/test.mp4" }), null);
assert.equal(playerFor({ ...v, embed: "https://www.youtube.com/embed/abcdefghijk" })?.kind, "youtube");
const controleer = (dir: string) => {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const pad = join(dir, item.name);
    if (item.isDirectory()) controleer(pad);
    else assert.equal(readFileSync(pad, "utf8").includes("/media/" + "dumpert"), false, pad);
  }
};
controleer("src");
controleer("functions");
console.log("✓ Dumpert-CDN toont een linkkaart; YouTube blijft afspeelbaar en de proxy is weg");
