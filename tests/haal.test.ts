import assert from "node:assert/strict";
import { haal } from "../worker/src/haal";
import { xFx, xSyndication } from "../worker/src/x";
import { vooraf } from "../worker/src/vooraf";

const origineel = globalThis.fetch, timeout = AbortSignal.timeout;
const verzoeken: { url: string; init: RequestInit; tijd: number }[] = [];
let tijd = 0;
AbortSignal.timeout = (ms) => { tijd = ms; return new AbortController().signal; };
globalThis.fetch = async (input, init = {}) => {
  verzoeken.push({ url: String(input), init, tijd });
  if (String(input).includes("fxtwitter")) return Response.json({ code: 200, results: [] });
  if (String(input).includes("syndication")) return new Response('<script id="__NEXT_DATA__" type="application/json">{}</script>');
  return Response.json({ filmpjes: [], dumpert: [] });
};
try {
  await haal("https://voorbeeld.nl", { ua: "agent", accept: "text/html", taal: "nl", timeout: 8000, redirect: "follow" });
  await xFx("voorbeeld");
  await xSyndication("voorbeeld");
  await vooraf({ SITE: "https://voorbeeld.nl", NIEUWS: { get: async () => null, put: async () => {} } as any }, 0);
  assert.deepEqual(verzoeken.map(({ init, tijd }) => ({ headers: init.headers, redirect: init.redirect, tijd })), [
    { headers: { "User-Agent": "agent", Accept: "text/html", "Accept-Language": "nl" }, redirect: "follow", tijd: 8000 },
    { headers: { "User-Agent": "nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)" }, redirect: undefined, tijd: 12000 },
    { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Accept: "text/html" }, redirect: undefined, tijd: 12000 },
    { headers: {}, redirect: undefined, tijd: 15000 },
  ]);
  console.log("✓ fetch-helper behoudt headers, redirects en time-outs");
} finally { globalThis.fetch = origineel; AbortSignal.timeout = timeout; }
