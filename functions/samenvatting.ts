// Cloudflare Pages Function: POST /samenvatting {id} -> samenvatting van één filmpje, op verzoek.
// 1. KV-cache per video (vs:<id>), dus elk filmpje kost hooguit één keer AI.
// 2. Tekst: YouTube-ondertiteling (ook automatische), anders spraak-naar-tekst met Whisper op de eerste
//    paar minuten geluid (Dumpert/Reddit-HLS: eerste stukjes; Instagram/X-mp4: alleen korte filmpjes).
// 3. Samenvatten in simpele, informele punten. Zelfde dagbudget als de uur-Worker: het uurnieuws gaat voor
//    (er blijft ruimte gereserveerd voor de rest van de dag), boven 70% het kleine model, pas bij het plafond een nette melding.
// Alleen filmpjes die nu op de site staan (geen willekeurige URL's ophalen).
// @ts-ignore - node:buffer via compatibility_flags nodejs_compat (snel, native base64)
import { Buffer } from "node:buffer";

type Usage = { neurons: number; calls: number; fails: number; inTok: number; outTok: number };
const RATES: Record<string, [number, number]> = { "@cf/google/gemma-4-26b-a4b-it": [9091, 27273], "@cf/meta/llama-3.2-1b-instruct": [2457, 18252], "@cf/meta/llama-3.2-3b-instruct": [4625, 30475] };
async function chat(ai: any, model: string, sys: string, user: string, maxTokens: number, u: Usage): Promise<string> {
  const r: any = await ai.run(model, { messages: [{ role: "system", content: sys }, { role: "user", content: user }], max_tokens: maxTokens, max_completion_tokens: maxTokens, temperature: 0.3, chat_template_kwargs: { enable_thinking: false, thinking: false } });
  u.calls++;
  const pt = r?.usage?.prompt_tokens ?? Math.ceil((sys.length + user.length) / 3.5);
  const ct = r?.usage?.completion_tokens ?? Math.ceil(String(r?.response ?? "").length / 3.5);
  const [ri, ro] = RATES[model] || [10000, 30000];
  u.inTok += pt; u.outTok += ct;
  u.neurons += typeof r?.usage?.neurons === "number" ? r.usage.neurons : (pt * ri + ct * ro) / 1e6;
  const txt = typeof r?.response === "string" ? r.response : r?.choices?.[0]?.message?.content || "";
  return String(txt).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

interface KV { get(key: string, type?: "json" | "text"): Promise<any>; put(key: string, v: string, o?: { expirationTtl?: number }): Promise<void> }
interface Env { NIEUWS: KV; AI: any; ASSETS: { fetch(req: Request | string): Promise<Response> }; BUDGET?: string; MODEL?: string; SMALL_MODEL?: string }
interface Ctx { request: Request; env: Env }

const BUDGET_DEF = 9000;
const MAIN = "@cf/google/gemma-4-26b-a4b-it", SMALL = "@cf/meta/llama-3.2-1b-instruct";
const WHISPER = "@cf/openai/whisper-large-v3-turbo";
const WHISPER_PER_MIN = 46.64; // $0.000513 per audiominuut / $0.011 per 1000 neuronen
const MAX_SEC = 180; // hooguit de eerste 3 minuten geluid
const MAX_MP4 = 12e6; // mp4 zonder knippen: alleen korte filmpjes
const PER_RUN = 260;
const PRE_MAX = 0.85, PRE_MARGE = 600; // vooraf maken: niet boven 85% van het budget, en 600 neuronen marge // reserve per nog komend uur-nieuws (gemiddelde run ±210–480)
const HDR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: HDR });

const MSG = {
  yt: "YouTube laat de ondertiteling van dit filmpje nu niet ophalen, dus samenvatten lukt hier niet. Probeer het later nog eens of kijk bij de bron.",
  geenTekst: "Bij dit filmpje vond ik geen ondertiteling of gesproken tekst, dus samenvatten lukt niet.",
  teLang: "Dit filmpje is te lang om hier te beluisteren. Bekijk het bij de bron.",
  budget: "Samenvatten kan vandaag niet meer: de dagruimte voor AI is op. Morgen kan het weer!",
  bezig: "Deze samenvatting wordt net gemaakt. Probeer het over een paar tellen nog eens.",
  onbekend: "Dit filmpje staat niet (meer) op de site.",
  fout: "Samenvatten lukt even niet. Probeer het later nog eens.",
};

function ams(t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, h: +p.hour };
}
export const ytId = (u = "") => /(?:youtube(?:-nocookie)?\.com\/(?:shorts\/|embed\/|watch\?(?:.*&)?v=|live\/)|youtu\.be\/)([\w-]{11})/.exec(u)?.[1] || null;

// ---------------- tekst uit YouTube-ondertiteling
function capText(j: any): string {
  const out: string[] = [];
  for (const e of j?.events || []) {
    const t = (e.segs || []).map((s: any) => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
    if (t && t !== out[out.length - 1]) out.push(t);
  }
  return out.join(" ").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}
function vttText(v: string): string {
  const out: string[] = [];
  for (const l of v.split("\n")) {
    if (!l.trim() || l.includes("-->") || /^(WEBVTT|Kind:|Language:|\d+$)/.test(l)) continue;
    const t = l.replace(/<[^>]+>/g, "").trim();
    if (t && t !== out[out.length - 1]) out.push(t);
  }
  return out.join(" ");
}
async function ytCaptions(id: string, why: string[]): Promise<string> {
  const pick = (tr: any[]) => [...tr].sort((a, b) => (a.languageCode !== "nl" ? 1 : 0) - (b.languageCode !== "nl" ? 1 : 0) || (a.kind === "asr" ? 1 : 0) - (b.kind === "asr" ? 1 : 0))[0];
  for (const c of [
    { ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip", client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30 } },
    { ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)", client: { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2" } },
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", client: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20250310.01.00" }, embed: true },
    { ua: "Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko)", client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0" }, embed: true },
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1", client: { clientName: "MWEB", clientVersion: "2.20250311.03.00" } },
  ] as any[]) {
    try {
      const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": c.ua }, body: JSON.stringify({ context: { client: { ...c.client, hl: "nl", gl: "NL" }, ...(c.embed ? { thirdParty: { embedUrl: "https://nieuwsinkort.nl/" } } : {}) }, videoId: id }), signal: AbortSignal.timeout(8000) });
      const j: any = await r.json();
      const tr = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (!tr.length) { why.push(`YouTube ${c.client.clientName}: geen ondertiteling (${j?.playabilityStatus?.status || r.status})`); continue; }
      const t = pick(tr);
      const x = await fetch(String(t.baseUrl).replace(/&fmt=[^&]*/, "") + "&fmt=json3", { headers: { "User-Agent": c.ua }, signal: AbortSignal.timeout(8000) });
      if (!x.ok) { why.push(`YouTube-ondertiteling ${c.client.clientName}: HTTP ${x.status}`); continue; }
      const txt = capText(await x.json());
      if (txt.length > 40) return txt;
      why.push(`YouTube-ondertiteling ${c.client.clientName}: leeg`);
    } catch (e: any) { why.push(`YouTube ${c.client.clientName}: ${String(e?.message || e).slice(0, 60)}`); }
  }
  // terugval: Invidious-spiegels
  for (const h of ["inv.nadeko.net", "yewtu.be", "invidious.nerdvpn.de"]) {
    try {
      const r = await fetch(`https://${h}/api/v1/captions/${id}`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) { why.push(`Invidious ${h}: HTTP ${r.status}`); continue; }
      const caps = ((await r.json()) as any)?.captions || [];
      if (!caps.length) { why.push(`Invidious ${h}: geen ondertiteling`); continue; }
      caps.sort((a: any, b: any) => (a.languageCode !== "nl" ? 1 : 0) - (b.languageCode !== "nl" ? 1 : 0));
      const v = await fetch(`https://${h}${caps[0].url}`, { signal: AbortSignal.timeout(6000) });
      const txt = vttText(await v.text());
      if (txt.length > 40) return txt;
    } catch (e: any) { why.push(`Invidious ${h}: ${String(e?.message || e).slice(0, 50)}`); }
  }
  return "";
}

// ---------------- geluid voor Whisper
async function hlsAudio(url: string, why: string[], maxSec = MAX_SEC): Promise<{ bytes: Uint8Array; sec: number } | null> {
  const get = async (u: string) => { const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (nieuwsinkort.nl)" }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; };
  let list = await (await get(url)).text();
  let base = url;
  if (/#EXT-X-STREAM-INF/.test(list)) {
    // Reddit heeft een los audiospoor; anders de variant met de laagste bitrate
    const audio = /#EXT-X-MEDIA:TYPE=AUDIO[^\n]*URI="([^"]+)"/.exec(list)?.[1];
    let pickU = audio;
    if (!pickU) {
      const vs = [...list.matchAll(/#EXT-X-STREAM-INF:[^\n]*BANDWIDTH=(\d+)[^\n]*\n([^\n#]+)/g)].map((m) => ({ bw: +m[1], u: m[2].trim() })).sort((a, b) => a.bw - b.bw);
      pickU = vs[0]?.u;
    }
    if (!pickU) { why.push("HLS: geen spoor"); return null; }
    base = new URL(pickU, url).toString();
    list = await (await get(base)).text();
  }
  if (/#EXT-X-MAP|\.m4s/.test(list)) { why.push("HLS: fMP4-stukjes (niet ondersteund)"); return null; }
  const segs: { u: string; d: number }[] = [];
  let d = 0;
  for (const m of list.matchAll(/#EXTINF:([\d.]+)[^\n]*\n([^\n#]+)/g)) segs.push({ d: +m[1], u: new URL(m[2].trim(), base).toString() });
  const take: string[] = [];
  for (const s of segs) { if (d >= maxSec || take.length >= 40) break; take.push(s.u); d += s.d; }
  if (!take.length) { why.push("HLS: geen stukjes"); return null; }
  const parts = await Promise.all(take.map(async (u) => new Uint8Array(await (await get(u)).arrayBuffer())));
  const n = parts.reduce((a, p) => a + p.length, 0), bytes = new Uint8Array(n);
  let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
  return { bytes, sec: d };
}
async function mp4Audio(url: string, why: string[], maxBytes = MAX_MP4): Promise<{ bytes: Uint8Array; sec: number } | null> {
  const H = { "User-Agent": "Mozilla/5.0 (nieuwsinkort.nl)" };
  // eerst alleen het begin: staat de index (moov) vooraan, dan is een afgeknipt stuk nog af te spelen
  const r = await fetch(url, { headers: { ...H, Range: `bytes=0-${maxBytes - 1}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) { why.push(`mp4: HTTP ${r.status}${r.status === 403 ? " (link verlopen)" : ""}`); return null; }
  const bytes = new Uint8Array(await r.arrayBuffer());
  const total = +((r.headers.get("content-range") || "").split("/")[1] || 0) || bytes.length;
  if (total <= bytes.length) return { bytes, sec: 0 };
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const moov = head.indexOf("moov"), mdat = head.indexOf("mdat");
  if (moov >= 0 && (mdat < 0 || moov < mdat)) { why.push(`mp4: eerste ${Math.round(maxBytes / 1e6)} van ${Math.round(total / 1e6)} MB`); return { bytes, sec: 0 }; }
  why.push(`mp4: te groot (${Math.round(total / 1e6)} MB, index achteraan)`);
  return { bytes: new Uint8Array(0), sec: -1 };
}

// ---------------- samenvatten
const STIJL = "Je schrijft voor de Nederlandse nieuwssite 'Nieuws in het kort'. Schrijf in heel simpel, informeel Nederlands: korte zinnen, gewone woorden, geen jargon. Gebruik ALLEEN wat in de tekst staat; verzin niets, geen eigen mening. Is de tekst Engels, schrijf toch in het Nederlands.";
async function punten(ai: any, model: string, titel: string, bron: string, tekst: string, u: Usage): Promise<string[]> {
  const user = `Dit is wat er gezegd wordt in een filmpje van ${bron} met de titel "${titel}".\nVat het samen in 3 tot 5 korte punten (elk max 15 woorden). Zet elk punt op een nieuwe regel en begin met "- ". Geen inleiding, geen kopje.\n\nTekst:\n${tekst}`;
  const t = await chat(ai, model, STIJL, user, 320, u);
  return t.split("\n").map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim()).filter((l) => l.length > 3 && !/^(hier|samenvatting|punten)\b.*:$/i.test(l)).slice(0, 5);
}

// ---------------- welke filmpjes staan er nu op de site
async function vindVideo(env: Env, req: Request, id: string): Promise<any | null> {
  const lists: any[] = [];
  try { const H = await env.NIEUWS.get("uur", "json"); if (H) lists.push(...(H.filmpjes || []), ...(H.dumpert || [])); } catch {}
  try { const S: any = await (await env.ASSETS.fetch(new URL("/data.json", req.url).toString())).json(); lists.push(...(S.filmpjes || []), ...(S.dumpert || [])); } catch {}
  const { videoSlug } = await import("../src/slug");
  return lists.find((v) => v?.href && videoSlug(v) === id) || null;
}

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const id = String(body?.id || "");
  // pre = vooraf maken door de uur-Worker: strenger budget (marge voor nieuws + verzoeken), korter luisteren
  const pre = body?.pre === true;
  if (!/^[\w-]{3,90}$/.test(id)) return json({ ok: false, code: "onbekend", fout: MSG.onbekend }, 400);
  const key = `vs:${id}`;
  const hit = await env.NIEUWS.get(key, "json").catch(() => null);
  if (hit) return json({ ...hit, cached: true });
  const v = await vindVideo(env, request, id);
  if (!v) return json({ ok: false, code: "onbekend", fout: MSG.onbekend }, 404);
  if (await env.NIEUWS.get(`vs-bezig:${id}`).catch(() => null)) return json({ ok: false, code: "bezig", fout: MSG.bezig }, 409);

  // ---- budget (gedeeld met de uur-Worker)
  const BUDGET = +(env.BUDGET || BUDGET_DEF);
  const A = ams();
  const vKey = `vid-neurons:${A.iso}`;
  const st: any = await env.NIEUWS.get("state", "json").catch(() => null);
  const nieuws = st && st.datum === A.iso ? +st.neurons || 0 : 0;
  const video = +(await env.NIEUWS.get(vKey).catch(() => 0)) || 0;
  const used = nieuws + video;
  const reserve = Math.max(0, 23 - A.h) * PER_RUN; // het uurnieuws van de rest van de dag gaat voor
  const ruimte = BUDGET - used - reserve;
  if (ruimte < 60) return json({ ok: false, code: "budget", fout: MSG.budget });
  const zuinig = used >= 0.7 * BUDGET;
  // vooraf maken stopt ruim vóór het plafond: max 85% van het budget én nog PRE_MARGE vrij voor nieuws/verzoeken
  if (pre && (used >= PRE_MAX * BUDGET || ruimte < PRE_MARGE + 60)) return json({ ok: false, code: "budget-pre", used: Math.round(used), ruimte: Math.round(ruimte) });
  const model = !zuinig ? env.MODEL || MAIN : env.SMALL_MODEL || SMALL;
  const maxSec = pre ? (zuinig ? 45 : 120) : zuinig ? 120 : MAX_SEC;
  const maxMp4 = pre ? (zuinig ? 4e6 : 8e6) : MAX_MP4;
  const ruimteNu = pre ? ruimte - PRE_MARGE : ruimte;

  await env.NIEUWS.put(`vs-bezig:${id}`, "1", { expirationTtl: 60 }).catch(() => {});
  const u: Usage = { neurons: 0, calls: 0, fails: 0, inTok: 0, outTok: 0 };
  const why: string[] = [];
  let tekst = "", bron = "", sec = 0;
  try {
    const yt = ytId(v.embed) || ytId(v.href);
    if (yt) {
      tekst = await ytCaptions(yt, why);
      bron = "ondertiteling";
    } else {
      const media = String(v.embed || "");
      let a: { bytes: Uint8Array; sec: number } | null = null;
      try {
        if (/\.m3u8(\?|$)/.test(media)) a = await hlsAudio(media, why, maxSec);
        else if (/\.mp4(\?|$)/.test(media) || /cdninstagram|fbcdn|twimg/.test(media)) a = await mp4Audio(media, why, maxMp4);
        else why.push("geen geluidsbron");
      } catch (e: any) { why.push(`geluid ophalen: ${String(e?.message || e).slice(0, 60)}`); }
      if (a && a.sec < 0) { await env.NIEUWS.put(key, JSON.stringify({ ok: false, code: "te-lang", fout: MSG.teLang }), { expirationTtl: 6 * 3600 }); return json({ ok: false, code: "te-lang", fout: MSG.teLang, why }); }
      if (a && a.bytes.length) {
        const estMin = a.sec ? a.sec / 60 : Math.min(4, a.bytes.length / 1.2e6); // mp4: ruwe schatting
        if (estMin * WHISPER_PER_MIN + 30 > ruimteNu) return json({ ok: false, code: pre ? "budget-pre" : "budget", fout: MSG.budget });
        const r: any = await env.AI.run(WHISPER, { audio: Buffer.from(a.bytes).toString("base64"), vad_filter: true, condition_on_previous_text: false });
        const dur = +r?.transcription_info?.duration || estMin * 60;
        u.neurons += (dur / 60) * WHISPER_PER_MIN; u.calls++;
        sec = Math.round(dur);
        tekst = String(r?.text || "").replace(/\s+/g, " ").trim();
        bron = "spraak";
        if (tekst.length < 40) why.push("Whisper: (bijna) geen spraak");
      }
    }
    if (tekst.length < 40) {
      const blok = why.some((w) => /LOGIN_REQUIRED|HTTP 429/.test(w));
      const out = blok ? { ok: false, code: "geblokkeerd", fout: MSG.yt } : { ok: false, code: "geen-tekst", fout: MSG.geenTekst };
      // geen spraak verandert niet: lang onthouden (geen dubbele Whisper-kosten); YouTube-blokkade sneller opnieuw
      await env.NIEUWS.put(key, JSON.stringify(out), { expirationTtl: blok ? 3 * 3600 : bron === "spraak" ? 24 * 3600 : 6 * 3600 });
      await addNeurons(env, vKey, u.neurons);
      return json({ ...out, why, neuronen: Math.round(u.neurons * 10) / 10 });
    }
    const p = await punten(env.AI, model, String(v.titel || ""), String(v.bron || ""), tekst.slice(0, 9000), u);
    await addNeurons(env, vKey, u.neurons);
    if (p.length < 2) return json({ ok: false, code: "fout", fout: MSG.fout, why: [...why, "samenvatting leeg"] });
    const out = { ok: true, punten: p, bron, sec, model, neuronen: Math.round(u.neurons * 10) / 10, gemaakt: new Date().toISOString(), ...(pre ? { vooraf: true } : {}) };
    await env.NIEUWS.put(key, JSON.stringify(out), { expirationTtl: 30 * 86400 });
    return json(out);
  } catch (e: any) {
    await addNeurons(env, vKey, u.neurons).catch(() => {});
    const m = String(e?.message || e);
    if (/quota|neuron|exceed|429|limit/i.test(m)) return json({ ok: false, code: "budget", fout: MSG.budget });
    return json({ ok: false, code: "fout", fout: MSG.fout, why: [...why, m.slice(0, 120)] }, 500);
  } finally {
    // slot hoeft niet weg: verloopt na 60 s; cache staat er al
  }
};
async function addNeurons(env: Env, k: string, n: number) {
  if (!(n > 0)) return;
  const cur = +(await env.NIEUWS.get(k).catch(() => 0)) || 0;
  await env.NIEUWS.put(k, String(Math.round((cur + n) * 10) / 10), { expirationTtl: 3 * 86400 });
}
export const onRequestGet = async ({ request, env }: Ctx) => {
  // GET /samenvatting?id=... alleen uit de cache (handig om te tonen of er al een samenvatting is)
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[\w-]{3,90}$/.test(id)) return json({ ok: false }, 400);
  const hit = await env.NIEUWS.get(`vs:${id}`, "json").catch(() => null);
  return json(hit ? { ...hit, cached: true } : { ok: false, code: "geen" });
};
