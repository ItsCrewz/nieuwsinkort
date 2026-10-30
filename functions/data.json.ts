// Cloudflare Pages Function: /data.json = data.json van de routine (08:00, statisch in dist/)
// samengevoegd met de uur-update uit KV (Worker "nieuwsinkort-uur", elk uur 06–23).
// - samenvattingen, "In het kort" en kernpunten van de routine blijven staan;
// - nieuwere berichten van het uur komen erbovenop, weer en filmpjes worden ververst;
// - geen of verouderde uur-data (of ?statisch=1) -> gewoon de statische data.json.
import { alleenVandaag } from "../src/vandaag";
import { schoon } from "../src/schoon";
import { youtubeId } from "../src/slug";
interface KV { get(key: string, opts: { type: "json"; cacheTtl?: number }): Promise<any> }
interface Env { NIEUWS?: KV; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env }

const dag = (iso?: string) => {
  const t = iso ? Date.parse(iso) : Date.now();
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }) : "";
};
const norm = (l = "") => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
const KV_TTL = 60;
const HDR = { "X-Content-Type-Options": "nosniff", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate, stale-while-revalidate=300", "Access-Control-Allow-Origin": "*" };

/** Velden die de site niet leest (alleen diagnose); weg uit de respons. */
export function slim(d: any) {
  if (!d || typeof d !== "object") return d;
  const { ontdubbeld, routine_gegenereerd, oud, ...rest } = d;
  return rest;
}

/** Zwakke ETag over de body: de 15-minuten-verversing krijgt dan een 304 zonder body zolang er niets nieuws is. */
async function etag(body: string) {
  const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(body));
  return `W/"${[...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

export function merge(S: any, H: any) {
  const vandaag = dag();
  if (!H || dag(H.gegenereerd) !== vandaag) return S; // uur-data van gisteren: niet gebruiken
  const sOk = S && dag(S.gegenereerd) === vandaag;
  const base = sOk ? S : { items: [], filmpjes: [], dumpert: [] };
  const geblokkeerd = new Set<string>(Array.isArray(H.ytGeblokkeerd) ? H.ytGeblokkeerd : []);
  const toegestaan = (v: any) => {
    const id = youtubeId(v.embed || "") || youtubeId(v.href || "");
    return !id || !geblokkeerd.has(id);
  };
  const sLinks = new Set<string>((base.items || []).flatMap((i: any) => (i.bronnen || []).map((b: any) => norm(b.href))));
  const nieuw = (H.items || []).filter((i: any) => !(i.bronnen || []).some((b: any) => sLinks.has(norm(b.href))));
  const hNieuwer = !sOk || Date.parse(H.gegenereerd) > Date.parse(S.gegenereerd);
  const sV = new Set<string>((base.filmpjes || []).map((v: any) => v.href));
  const sTijd = sOk ? new Date(S.gegenereerd).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }) : "00:00";
  // Nieuwe filmpjes van het uur (na de routine), plus alle Instagram-reels (die zijn altijd van nieuwsaccounts).
  // Per soort (Shorts/Journaals) apart begrensd, zodat de ene soort de andere niet wegdrukt.
  const extra = (H.filmpjes || []).filter((v: any) => !sV.has(v.href) && (!sOk || v.bron === "Instagram" || (v.tijd || "") >= sTijd));
  const extraF = [...extra.filter((v: any) => v.soort !== "journaal").slice(0, 12), ...extra.filter((v: any) => v.soort === "journaal").slice(0, 10)];
  const { meta, meerKeys, ...h } = H;
  // "Lees verder": ook berichten van de routine krijgen hun extra tekst (sleutel = eerste bron met tekst in KV "meer")
  const mk = new Set<string>(Array.isArray(meerKeys) ? meerKeys : []);
  const metMeer = (i: any) => {
    if (i.meer || !mk.size) return i;
    const k = (i.bronnen || []).map((b: any) => norm(b.href)).find((x: string) => mk.has(x));
    return k ? { ...i, meer: k } : i;
  };
  return {
    ...base,
    datum: H.datum || base.datum,
    dag_samenvatting: (hNieuwer && H.dag_samenvatting) || base.dag_samenvatting || H.dag_samenvatting || "",
    tab_samenvatting: H.tab_samenvatting,
    weer: H.weer && (H.weer.nu || H.weer.dagen?.length) ? { ...H.weer, verwachting: H.weer.verwachting || base.weer?.verwachting || "" } : base.weer,
    items: [...nieuw, ...(base.items || [])].map(metMeer),
    filmpjes: (sOk ? [...extraF, ...(base.filmpjes || [])] : H.filmpjes || []).filter(toegestaan),
    dumpert: ((H.dumpert || []).length >= 5 ? H.dumpert : base.dumpert || H.dumpert || []).filter(toegestaan),
    bronstats: h.bronstats || base.bronstats,
    gegenereerd: hNieuwer ? H.gegenereerd : S.gegenereerd,
    routine_gegenereerd: sOk ? S.gegenereerd : null,
    uur: { gegenereerd: H.gegenereerd, nieuw: nieuw.length, model: meta?.model, ai: meta?.aiStand || "" },
  };
}

/** Merge, dagfilter, opschonen en vooraf gemaakte video-samenvattingen (uur-Worker); elke stap valt bij een fout terug op de vorige. */
export function bouw(S: any, H: any, sv: any) {
  let out: any = S;
  try { out = merge(S, H); } catch { console.error("data.json: merge mislukt"); out = S; }
  try { out = alleenVandaag(out, Date.now()); } catch { console.error("data.json: dagfilter mislukt"); }
  try { out = schoon(out); } catch { console.error("data.json: opschonen mislukt"); /* ongeschoond is beter dan niets */ }
  if (sv?.klaar) out = { ...out, samenvattingen: sv.klaar }; // zonder: de knop haalt hem op verzoek op
  return out;
}

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const u = new URL(request.url);
  const stat = await env.ASSETS.fetch(new Request(new URL("/data.json", u.origin).toString()));
  if (u.searchParams.has("statisch") || !env.NIEUWS || !stat.ok) {
    return new Response(stat.body, { status: stat.status, headers: { ...HDR, "Cache-Control": "no-cache" } });
  }
  // KV-reads parallel aan het parsen van de statische data; cacheTtl 60 (KV-minimum) laat warme edge-locaties lokaal lezen
  const kv = (key: string) => env.NIEUWS!.get(key, { type: "json", cacheTtl: KV_TTL }).catch(() => { console.error(`data.json: KV ${key} lezen mislukt`); return null; });
  const [S, H, sv] = await Promise.all([stat.json() as Promise<any>, kv("uur"), kv("sv-klaar")]);
  const out = bouw(S, H, sv);
  const body = JSON.stringify(slim(out));
  const tag = await etag(body);
  if (request.headers.get("If-None-Match") === tag) return new Response(null, { status: 304, headers: { ...HDR, ETag: tag } });
  return new Response(body, { headers: { ...HDR, ETag: tag } });
};
