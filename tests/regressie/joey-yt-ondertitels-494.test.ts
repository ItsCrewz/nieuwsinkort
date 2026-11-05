import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playerFor } from "../../src/videosoort";
import * as yt from "../../src/ytstart";

const speler = playerFor({ embed: "https://youtube.com/watch?v=OojWxAiS5ew", href: "", titel: "", ai: "", bron: "", thumb: "", populariteit: "", tijd: "" });
assert.equal(speler?.kind, "youtube");
for (const adres of [speler!.src, yt.ytEmbedUrl("OojWxAiS5ew", true, "https://voorbeeld.nl"), yt.ytEmbedUrl("OojWxAiS5ew", false, "https://voorbeeld.nl")]) {
  const p = new URL(adres).searchParams;
  assert.deepEqual(p.getAll("cc_load_policy"), ["0"]);
  assert.equal(p.has("cc_lang_pref"), false);
  assert.equal(p.has("hl"), false);
}
const opdrachten: unknown[] = [];
const nep = { postMessage: (bericht: string, origin: string) => opdrachten.push([JSON.parse(bericht), origin]) };
const frame = { contentWindow: nep } as unknown as HTMLIFrameElement;
const bericht = { origin: "https://www.youtube-nocookie.com", source: nep, data: JSON.stringify({ event: "onReady" }) } as unknown as MessageEvent;
yt.ytOndertitelsBijBericht({ ...bericht, origin: "https://voorbeeld.nl" }, [frame]);
yt.ytOndertitelsBijBericht({ ...bericht, data: JSON.stringify({ event: "onStateChange" }) }, [frame]);
yt.ytOndertitelsBijBericht({ ...bericht, source: {} as Window }, [frame]);
assert.deepEqual(opdrachten, []);
yt.ytOndertitelsBijBericht(bericht, [frame]);
assert.deepEqual(opdrachten, [[{ event: "command", func: "unloadModule", args: ["captions"] }, "https://www.youtube-nocookie.com"]]);
assert.match(readFileSync("src/video.tsx", "utf8"), /onReady[\s\S]*ytOndertitelsBijBericht/);
