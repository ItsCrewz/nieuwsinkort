// Cloudflare Pages Function: /data.json = data.json van de routine (08:00, statisch in dist/)
// samengevoegd met de uur-update uit KV (Worker "nieuwsinkort-uur", elk uur 06–23).
// - samenvattingen, "In het kort" en kernpunten van de routine blijven staan;
// - nieuwere berichten van het uur komen erbovenop, weer en filmpjes worden ververst;
// - geen of verouderde uur-data (of ?statisch=1) -> gewoon de statische data.json.
import { schoon } from "../src/schoon";
interface KV { get(key: string, type: "json"): Promise<any> }
interface Env { NIEUWS?: KV; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env }

const dag = (iso?: string) => {
  const t = iso ? Date.parse(iso) : Date.now();
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }) : "";
};
const norm = (l = "") => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
const HDR = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" };

export function merge(S: any, H: any) {
  const vandaag = dag();
  if (!H || dag(H.gegenereerd) !== vandaag) return S; // uur-data van gisteren: niet gebruiken
  const sOk = S && dag(S.gegenereerd) === vandaag;
  const base = sOk ? S : { items: [], filmpjes: [], dumpert: [] };
  const sLinks = new Set<string>((base.items || []).flatMap((i: any) => (i.bronnen || []).map((b: any) => norm(b.href))));
  const nieuw = (H.items || []).filter((i: any) => !(i.bronnen || []).some((b: any) => sLinks.has(norm(b.href))));
  const hNieuwer = !sOk || Date.parse(H.gegenereerd) > Date.parse(S.gegenereerd);
  const sV = new Set<string>((base.filmpjes || []).map((v: any) => v.href));
  const sTijd = sOk ? new Date(S.gegenereerd).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }) : "00:00";
  // Nieuwe filmpjes van het uur (na de routine), plus alle Instagram-reels (die zijn altijd van nieuwsaccounts).
  // Per soort (Shorts/Journaals) apart begrensd, zodat de ene soort de andere niet wegdrukt.
  const extra = (H.filmpjes || []).filter((v: any) => !sV.has(v.href) && (!sOk || v.bron === "Instagram" || (v.tijd || "") >= sTijd));
  const extraF = [...extra.filter((v: any) => v.soort !== "journaal").slice(0, 12), ...extra.filter((v: any) => v.soort === "journaal").slice(0, 10)];
  const { meta, ...h } = H;
  return {
    ...base,
    datum: H.datum || base.datum,
    dag_samenvatting: (hNieuwer && H.dag_samenvatting) || base.dag_samenvatting || H.dag_samenvatting || "",
    weer: H.weer && (H.weer.nu || H.weer.dagen?.length) ? { ...H.weer, verwachting: H.weer.verwachting || base.weer?.verwachting || "" } : base.weer,
    items: [...nieuw, ...(base.items || [])],
    filmpjes: sOk ? [...extraF, ...(base.filmpjes || [])] : H.filmpjes || [],
    dumpert: (H.dumpert || []).length >= 5 ? H.dumpert : base.dumpert || H.dumpert || [],
    bronstats: h.bronstats || base.bronstats,
    gegenereerd: hNieuwer ? H.gegenereerd : S.gegenereerd,
    routine_gegenereerd: sOk ? S.gegenereerd : null,
    uur: { gegenereerd: H.gegenereerd, nieuw: nieuw.length, model: meta?.model, ai: meta?.aiStand || "" },
  };
}

export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const u = new URL(request.url);
  const stat = await env.ASSETS.fetch(new Request(new URL("/data.json", u.origin).toString()));
  if (u.searchParams.has("statisch") || !env.NIEUWS || !stat.ok) {
    return new Response(stat.body, { status: stat.status, headers: { ...HDR, "Cache-Control": "no-cache" } });
  }
  const S: any = await stat.json();
  let H: any = null;
  try { H = await env.NIEUWS.get("uur", "json"); } catch { /* KV even niet bereikbaar: statisch */ }
  let out: any = S;
  try { out = merge(S, H); } catch { out = S; }
  try { out = schoon(out); } catch { /* ongeschoond is beter dan niets */ }
  return new Response(JSON.stringify(out), { headers: HDR });
};
