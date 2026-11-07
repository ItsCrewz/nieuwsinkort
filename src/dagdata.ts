// Cloudflare Pages Function: /data.json = data.json van de routine (08:00, statisch in dist/)
// samengevoegd met de uur-update uit KV (Worker "nieuwsinkort-uur", elk kwartier 06–23).
// - samenvattingen, "In het kort" en kernpunten van de routine blijven staan;
// - nieuwere berichten van het uur komen erbovenop, weer en filmpjes worden ververst;
// - geen of verouderde uur-data (of ?statisch=1) -> gewoon de statische data.json.
import { alleenVandaag } from "./vandaag";
import { schoon } from "./schoon";
import { youtubeId } from "./slug";
import { ams, vorigeDag } from "./tijd";
import { ontdubbelVerhalen } from "./verhaaldubbel";
interface KV { get(key: string, opts: { type: "json" | "text"; cacheTtl?: number }): Promise<any> }
interface Env { NIEUWS?: KV; ASSETS: { fetch(req: Request | string): Promise<Response> } }
interface Ctx { request: Request; env: Env }

const dag = (iso?: string) => {
  const t = iso ? Date.parse(iso) : Date.now();
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" }) : "";
};
const norm = (l = "") => l.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
// KV-edgecache (60 s is het minimum van KV): de leesvertraging blijft kleiner dan het kwartier tussen twee Worker-runs.
const kvOpt = (type: "json" | "text") => ({ type, cacheTtl: 60 });
// Per isolate: het verwerkte vooraf-antwoord 30 s hergebruiken zolang KV dezelfde tekst geeft (scheelt parse, dagfilter, stringify en SHA-1).
let voorafGeheugen: { vooraf: string; dag: string; tot: number; body: string; tag: string } | undefined;
const HDR = { "X-Content-Type-Options": "nosniff", "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=240", "Access-Control-Allow-Origin": "*" };

/** Velden die de site niet leest (alleen diagnose); weg uit de respons. */
export function slim(d: any) {
  if (!d || typeof d !== "object") return d;
  const { ontdubbeld, routine_gegenereerd, oud, ...rest } = d;
  // ft/fd = oorspronkelijke feedtitel en -beschrijving per bron (alleen voor de sportindeling in de Worker)
  if (Array.isArray(rest.items)) rest.items = rest.items.map((i: any) => Array.isArray(i?.bronnen) && i.bronnen.some((b: any) => b && typeof b === "object" && ("ft" in b || "fd" in b)) ? { ...i, bronnen: i.bronnen.map((bron: any) => { if (!bron || typeof bron !== "object") return bron; const { ft, fd, ...b } = bron; return b; }) } : i);
  return rest;
}

/** Zwakke ETag over de body: de 15-minuten-verversing krijgt dan een 304 zonder body zolang er niets nieuws is. */
export async function etag(body: string) {
  const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(body));
  return `W/"${[...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

export function merge(S: any, H: any) {
  const vandaag = dag();
  if (!H || dag(H.gegenereerd) !== vandaag) return S; // uur-data van gisteren: niet gebruiken
  const sOk = S && dag(S.gegenereerd) === vandaag;
  const base = sOk ? { ...S } : { items: [], filmpjes: [], dumpert: [] };
  const geblokkeerd = new Set<string>(Array.isArray(H.ytGeblokkeerd) ? H.ytGeblokkeerd : []);
  const toegestaan = (v: any) => {
    const id = youtubeId(v.embed || "") || youtubeId(v.href || "");
    return !id || !geblokkeerd.has(id);
  };
  const sLinks = new Set<string>((base.items || []).flatMap((i: any) => (i.bronnen || []).map((b: any) => norm(b.href))));
  // Eerst dagfilteren en op tijd ordenen, zodat oude berichten geen plek innemen.
  const uurItems = (H.items || []).length > 150 ? alleenVandaag(H, Date.now()).items : (H.items || []);
  const nieuw = uurItems.filter((i: any) => !(i.bronnen || []).some((b: any) => sLinks.has(norm(b.href))));
  if (nieuw.length > 150) {
    nieuw.sort((a: any, b: any) => (b.t ?? 0) - (a.t ?? 0) || (b.tijd || "").localeCompare(a.tijd || ""));
    nieuw.length = 150;
  }
  const hNieuwer = !sOk || Date.parse(H.gegenereerd) > Date.parse(S.gegenereerd);
  // Selecteer de dag vóór de keuze tussen routine en uurdata.
  const nu = Date.now();
  for (const key of ["filmpjes", "dumpert"] as const) {
    const selectie = (lijst: any[]) => {
      const bekend = lijst.filter((v: any) => typeof v?.t === "number" || v?.gisteren);
      const gekozen = alleenVandaag({ gegenereerd: H.gegenereerd, [key]: bekend }, nu)[key];
      return [...gekozen, ...lijst.filter((v: any) => typeof v?.t !== "number" && !v?.gisteren)];
    };
    const samen = selectie([...(base[key] || []), ...(H[key] || [])]);
    const vandaagVideo = samen.some((v: any) => !v.gisteren);
    base[key] = selectie(base[key] || []).filter((v: any) => !!v.gisteren !== vandaagVideo);
    H = { ...H, [key]: selectie(H[key] || []).filter((v: any) => !!v.gisteren !== vandaagVideo) };
  }
  const sV = new Set<string>((base.filmpjes || []).map((v: any) => v.href));
  const sTijd = sOk ? new Date(S.gegenereerd).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }) : "00:00";
  // Nieuwe filmpjes van het uur (na de routine), plus alle Instagram-reels (die zijn altijd van nieuwsaccounts).
  // Per soort (Shorts/Journaals) apart begrensd, zodat de ene soort de andere niet wegdrukt.
  const extra = (H.filmpjes || []).filter((v: any) => !sV.has(v.href) && (!sOk || v.gisteren || v.bron === "Instagram" || (v.tijd || "") >= sTijd));
  const extraF = [...extra.filter((v: any) => v.soort !== "journaal").slice(0, 12), ...extra.filter((v: any) => v.soort === "journaal").slice(0, 10)];
  const { meta, meerKeys, ...h } = H;
  // "Lees verder": ook berichten van de routine krijgen hun extra tekst (sleutel = eerste bron met tekst in KV "meer")
  const mk = new Set<string>(Array.isArray(meerKeys) ? meerKeys : []);
  const metMeer = (i: any) => {
    if (i.meer || !mk.size) return i;
    const k = (i.bronnen || []).map((b: any) => norm(b.href)).find((x: string) => mk.has(x));
    return k ? { ...i, meer: k } : i;
  };
  const routineItems = (base.items || []).map(metMeer);
  return {
    ...base,
    datum: H.datum || base.datum,
    dag_samenvatting: (hNieuwer && H.dag_samenvatting) || base.dag_samenvatting || H.dag_samenvatting || "",
    tab_samenvatting: H.tab_samenvatting,
    weer: H.weer && (H.weer.nu || H.weer.dagen?.length) ? { ...H.weer, verwachting: H.weer.verwachting || base.weer?.verwachting || "" } : base.weer,
    items: ontdubbelVerhalen([...nieuw.map(metMeer), ...routineItems], new Set(routineItems)),
    filmpjes: (sOk ? [...extraF, ...(base.filmpjes || [])] : H.filmpjes || []).filter(toegestaan),
    dumpert: ((H.dumpert || []).length >= 5 || !(base.dumpert || []).length ? H.dumpert || [] : base.dumpert).filter(toegestaan),
    bronstats: h.bronstats || base.bronstats,
    gegenereerd: hNieuwer ? H.gegenereerd : S.gegenereerd,
    routine_gegenereerd: sOk ? S.gegenereerd : null,
    uur: { gegenereerd: H.gegenereerd, nieuw: nieuw.length, model: meta?.model, ai: meta?.aiStand || "" },
  };
}

export async function berekenBody(S: any, H: any, sv: any, nu = Date.now()) {
  let out = merge(S, H);
  out = alleenVandaag(out, nu);
  out = schoon(out);
  if (sv?.klaar) out = { ...out, samenvattingen: sv.klaar };
  return JSON.stringify(slim(out));
}

export const dagdata = async ({ request, env }: Ctx, video = true): Promise<Response> => {
  const u = new URL(request.url);
  if (!u.searchParams.has("statisch") && env.NIEUWS) {
    try {
      const vooraf = await env.NIEUWS.get("data-vooraf", kvOpt("text"));
      if (vooraf && (vooraf.slice(0, 10) === dag() || (ams().h < 6 && vooraf.slice(0, 10) === vorigeDag())) && vooraf[10] === "\n") {
        const einde = vooraf.indexOf("\n", 11);
        if (einde > 11) {
          const nu = Date.now(), vandaag = dag();
          let g = voorafGeheugen;
          if (!g || g.vooraf !== vooraf || g.dag !== vandaag || g.tot < nu) {
            const data = JSON.parse(vooraf.slice(einde + 1));
            const gefilterd = alleenVandaag(data, nu);
            const body = JSON.stringify({ ...data, ...(Array.isArray(data.filmpjes) ? { filmpjes: gefilterd.filmpjes } : {}), ...(Array.isArray(data.dumpert) ? { dumpert: gefilterd.dumpert } : {}) });
            g = voorafGeheugen = { vooraf, dag: vandaag, tot: nu + 30e3, body, tag: await etag(body) };
          }
          const { body, tag } = g;
          if (request.headers.get("If-None-Match") === tag) return new Response(null, { status: 304, headers: { ...HDR, ETag: tag } });
          return new Response(body, { headers: { ...HDR, ETag: tag } });
        }
      }
    } catch { console.error("data.json: KV vooraf lezen mislukt"); }
  }
  const assetUrl = new URL("/data.json", u.origin).toString();
  let stat: Response | undefined;
  for (let poging = 0; poging < 2; poging++) {
    try { stat = await env.ASSETS.fetch(new Request(assetUrl)); } catch { stat = undefined; }
    if (stat?.ok) break;
  }
  if (!stat?.ok) return new Response(JSON.stringify({ fout: "Data tijdelijk niet beschikbaar" }), { status: 503, headers: { ...HDR, "Cache-Control": "no-store", "Retry-After": "60" } });
  if (u.searchParams.has("statisch") || !env.NIEUWS) {
    return new Response(stat.body, { status: stat.status, headers: { ...HDR, "Cache-Control": "no-cache" } });
  }
  const S: any = await stat.json();
  let H: any = null;
  try { H = await env.NIEUWS.get("uur", kvOpt("json")); } catch { console.error("data.json: KV uur lezen mislukt"); /* KV even niet bereikbaar: statisch */ }
  let out: any = S;
  try { out = merge(S, H); } catch { console.error("data.json: merge mislukt"); out = S; }
  try { out = alleenVandaag(out, Date.now()); } catch { console.error("data.json: dagfilter mislukt"); }
  try { out = schoon(out); } catch { console.error("data.json: opschonen mislukt"); /* ongeschoond is beter dan niets */ }
  // vooraf gemaakte video-samenvattingen (uur-Worker): meteen meesturen, dan opent het onderblad direct
  try {
    const sv: any = video ? await env.NIEUWS.get("sv-klaar", kvOpt("json")) : null;
    if (sv?.klaar) out = { ...out, samenvattingen: sv.klaar };
  } catch { console.error("data.json: KV samenvattingen lezen mislukt"); /* zonder: de knop haalt hem op verzoek op */ }
  const body = JSON.stringify(slim(out));
  const tag = await etag(body);
  if (request.headers.get("If-None-Match") === tag) return new Response(null, { status: 304, headers: { ...HDR, ETag: tag } });
  return new Response(body, { headers: { ...HDR, ETag: tag } });
};
