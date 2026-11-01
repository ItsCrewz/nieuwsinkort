// Opslagbeleid van de uur-Worker (#452): KV (1.000 schrijfacties per dag) alleen bij wijziging, met een hartslag
// van 50 minuten zodat een uurlijkse cron gedrag en inhoud houdt. State en caches staan primair in DO-opslag.
// Pure logica (geen Cloudflare-imports), getest met nep-opslag in tests/kv-opslag.test.ts.

/** Hartslag: bij uurlijks draaien (±60 min tussen runs) is een schrijfactie altijd "aan de beurt"; 50, niet 60, vangt jitter op. */
export const HARTSLAG_MS = 50 * 60e3;
export const DAG_MS = 24 * 3600e3;
export const OG_MAX = 3000;
export const OG_TTL_MS = 3 * DAG_MS;
export const IG_TTL_MS = 20 * 3600e3;
export const TELLERS_MAX = 48;

type Opslag = any; // DurableObjectStorage of nep-opslag; alleen get/put/delete worden gebruikt
type Kv = any;

// ---------------------------------------------------------------- tellers
export interface Tel { kv: Kv; opslag: Opslag; kvN(): number; kvSleutels(): string[]; doN(): number }

/** Wikkelt KV en DO-opslag in tellende proxy's: elke put/delete telt (ook een mislukte poging, zoals de limiet). Per-item og:/ig:-sleutels komen niet in de lijst. */
export function maakTel(kv: Kv, opslag: Opslag): Tel {
  let kvN = 0, doN = 0;
  const sleutels: string[] = [];
  const kvP = kv && new Proxy(kv, { get(t, p) {
    const f = Reflect.get(t, p);
    if (typeof f !== "function") return f;
    if (p === "put" || p === "delete") return (k: string, ...a: unknown[]) => { kvN++; if (!/^(og|ig):/.test(k) && !sleutels.includes(k)) sleutels.push(k); return f.call(t, k, ...a); };
    return f.bind(t);
  } });
  const doP = opslag && new Proxy(opslag, { get(t, p) {
    const f = Reflect.get(t, p);
    if (typeof f !== "function") return f;
    if (p === "put") return (k: unknown, ...a: unknown[]) => { doN += typeof k === "string" ? 1 : Object.keys(k as object).length; return f.call(t, k, ...a); };
    if (p === "delete") return (k: unknown) => { doN += Array.isArray(k) ? k.length : 1; return f.call(t, k); };
    return f.bind(t);
  } });
  return { kv: kvP, opslag: doP, kvN: () => kvN, kvSleutels: () => [...sleutels], doN: () => doN };
}

export interface TellerRegel { at: string; soort: "run" | "alarm"; kv: number; doWrites: number }
/** Laatste 48 regels; get en put volgen direct op elkaar (geen andere await ertussen), dus run en alarm overschrijven elkaar niet. */
export async function voegTellerToe(opslag: Opslag, regel: TellerRegel) {
  const l: TellerRegel[] = (await opslag.get("tellers")) || [];
  l.push(regel);
  await opslag.put("tellers", l.slice(-TELLERS_MAX));
}

// ---------------------------------------------------------------- KV alleen bij wijziging
export type KvStand = Record<string, { at: number; h?: string }>;

/** Schrijven als er nog nooit geschreven is, de inhoud (hash) anders is, de laatste write `max` of ouder is, of de klok terugliep. */
export function moetSchrijven(vorig: { at: number; h?: string } | undefined, h: string | undefined, nu: number, max = HARTSLAG_MS): boolean {
  return !vorig || vorig.at > nu || nu - vorig.at >= max || (h !== undefined && vorig.h !== h);
}

/** Voegt wijzigingen samen in de bewaarde stand (lezen en schrijven direct na elkaar; gelijktijdige run en alarm raken elkaars namen niet kwijt). */
export async function bewaarKvStand(opslag: Opslag, wijz: KvStand) {
  if (!Object.keys(wijz).length) return;
  const ks: KvStand = (await opslag.get("kvstand")) || {};
  await opslag.put("kvstand", { ...ks, ...wijz });
}

/** Inhoud van `uur` zonder vluchtige velden: gegenereerd, meta, tijdstempels `ok` in bronstats, gegenereerd per taboverzicht (de extractieve tekst krijgt elke run een nieuwe tijd; de UI toont die niet)
 *  en de weervelden die bij elke Buienradar-update (±10 min) wisselen: weer.bijgewerkt, weer.nu (actuele meting) en weer.vandaag (neerslagkans, wind). Die gaan mee met de hartslag of een andere wijziging (#461).
 *  Verwachting, dagen en vooral waarschuwing (KNMI-code) tellen wel mee, zodat een waarschuwing direct live gaat. */
export function uurInhoud(out: any): string {
  const { gegenereerd: _g, meta: _m, bronstats, weer, tab_samenvatting, ...rest } = out;
  const tabs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tab_samenvatting || {})) { const { gegenereerd: _t, ...r } = (v || {}) as any; tabs[k] = r; }
  const bs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bronstats || {})) { const { ok: _ok, ...r } = v as any; bs[k] = r; }
  let w = weer;
  if (weer && typeof weer === "object") { const { bijgewerkt: _b, nu: _n, vandaag: _v, ...r } = weer; w = r; }
  return JSON.stringify({ ...rest, tab_samenvatting: tabs, bronstats: bs, weer: w });
}

// ---------------------------------------------------------------- state in DO-opslag
/** Grote onderdelen van `state` krijgen een eigen sleutel (waarde max 2 MB); de rest staat in `st:rest`. */
export const STATE_DELEN = ["sums", "links", "hashes", "art", "artJ", "diep", "ytEmbed", "llm"] as const;
const sl = (d: string) => `st:${d}`;

export function splitState(st: Record<string, any>): Record<string, string> {
  const uit: Record<string, string> = {}, rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(st)) {
    if (!(STATE_DELEN as readonly string[]).includes(k)) rest[k] = v;
    else if (v !== undefined) uit[sl(k)] = JSON.stringify(v);
  }
  uit["st:rest"] = JSON.stringify(rest);
  return uit;
}

/** Staat in DO-opslag? `json` zijn de gelezen strings, om bij het schrijven alleen gewijzigde delen te vervangen. Geen state = null (migratie: dan KV). */
export async function leesState(opslag: Opslag): Promise<{ st: any; json: Record<string, string>; at: number | null } | null> {
  const rest = await opslag.get("st:rest");
  if (typeof rest !== "string") return null;
  const json: Record<string, string> = { "st:rest": rest };
  const st = JSON.parse(rest);
  const delen = await Promise.all(STATE_DELEN.map(async (d) => [d, await opslag.get(sl(d))] as const));
  for (const [d, s] of delen) if (typeof s === "string") { json[sl(d)] = s; st[d] = JSON.parse(s); }
  // st:at = commit-markering: alleen als allerlaatste geschreven, nadat alle delen gelukt zijn (ontbreekt = halve of oude DO-state)
  const at = Number(await opslag.get("st:at"));
  if (at > 0) json["st:at"] = String(at);
  return { st, json, at: at > 0 ? at : null };
}

/** Een DO-waarde mag 2 MB zijn; daaronder blijven we ruim (bytes van de JSON-tekst). */
export const DEEL_MAX = 1.8e6;
const bytes = (s: string) => new TextEncoder().encode(s).length;
/** Deze delen zijn caches per sleutel: te groot = de eerste (oudste) sleutels laten vallen tot het past. */
const KRIMPBAAR = ["st:art", "st:artJ", "st:diep"];

function krimp(naam: string, tekst: string): string {
  if (!KRIMPBAAR.includes(naam)) return tekst;
  const e = Object.entries(JSON.parse(tekst));
  while (e.length && bytes(tekst) > DEEL_MAX) { e.splice(0, Math.ceil(e.length / 10)); tekst = JSON.stringify(Object.fromEntries(e)); }
  return tekst;
}

/** Alleen de gewijzigde delen schrijven. `st:rest` (neuronenteller, llm-stand) eerst en apart, zodat die nooit mee faalt met een groot deel; `st:llm` als laatste, zodat een mislukking halverwege het llm-verbruik niet half bijschrijft (bewaarLlmDo telt het dan één keer bij).
 *  Een te groot deel wordt (bij art/artJ/diep: na inkorten) niet of verkleind geschreven en gelogd; de vorige DO-versie blijft dan staan. Geeft het aantal writes.
 *  Daarna volgt `st:at` (= st.stAt) als commit-markering, alleen als geen deel is overgeslagen; `status.volledig` meldt dat (false = de KV-kopie moet de stand dragen). */
export async function schrijfState(opslag: Opslag, st: Record<string, any>, vorige: Record<string, string>, status: { volledig: boolean } = { volledig: true }): Promise<number> {
  const nieuw = splitState(st), w: [string, string][] = [];
  for (const [k, v] of Object.entries(nieuw)) {
    if (vorige[k] === v) continue;
    const s = k === "st:rest" || bytes(v) <= DEEL_MAX ? v : krimp(k, v);
    if (k !== "st:rest" && bytes(s) > DEEL_MAX) { console.error(`state-deel ${k} te groot (${bytes(s)} bytes), niet geschreven`); status.volledig = false; continue; }
    if (s !== v) console.error(`state-deel ${k} te groot (${bytes(v)} bytes), ingekort`);
    w.push([k, s]);
  }
  const volg = (k: string) => (k === "st:rest" ? 0 : k === "st:llm" ? 2 : 1);
  w.sort((a, b) => volg(a[0]) - volg(b[0]));
  let n = 0;
  const weg = Object.keys(vorige).filter((k) => !(k in nieuw) && k !== "st:at");
  for (const [k, s] of w) { if (k === "st:llm") { for (const d of weg) { await opslag.delete(d); n++; } weg.length = 0; } await opslag.put(k, s); n++; }
  for (const d of weg) { await opslag.delete(d); n++; }
  const at = st.stAt === undefined ? undefined : String(st.stAt);
  if (status.volledig && at !== undefined && vorige["st:at"] !== at) { await opslag.put("st:at", at); n++; }
  return n;
}

/** Calls + tokens van de llm-teller (Groq e.d.) voor één dag. */
const llmSom = (st: any, dag: string) => Object.values(st.llm || {}).reduce((a: number, x: any) => a + (x?.dag === dag ? (x.calls || 0) + (x.tokens || 0) : 0), 0);

/** Wint de KV-kopie van `state` van de DO-opslag? Normaal is KV gelijk of ouder (kopie van een eerdere run). KV wint bij: een latere neuronendag; meer neuronen; een nieuwer `stAt` dan de commit-markering `st:at` van de DO (halve of overgeslagen DO-write: `doAt` null = ontbreekt); of, bij een terugrol naar de vorige Worker (die `stAt` niet bijwerkt en ook zonder neuronen draait), meer `runs` of een hoger llm-totaal op dezelfde dag. `doAt` undefined = markering niet controleren. */
export function kvStateWint(doSt: any, kvSt: any, doAt?: number | null): boolean {
  if (!kvSt || typeof kvSt !== "object" || !doSt) return false;
  const dd = doSt.neuronDag ?? doSt.datum, kd = kvSt.neuronDag ?? kvSt.datum;
  if (typeof kd !== "string" || typeof dd !== "string") return false;
  if (kd !== dd) return kd > dd;
  if ((kvSt.neurons || 0) > (doSt.neurons || 0)) return true;
  if (doAt !== undefined && (doAt === null || (kvSt.stAt || 0) > doAt)) return true;
  if (doAt === undefined && (kvSt.stAt || 0) > (doSt.stAt || 0)) return true;
  if (kvSt.datum === doSt.datum && (kvSt.runs || 0) > (doSt.runs || 0)) return true;
  return llmSom(kvSt, kd) > llmSom(doSt, kd);
}

/** Wat de alarm nodig heeft (neuronenteller) zonder de grote delen te lezen; null = geen DO-state. */
export async function leesStateRest(opslag: Opslag): Promise<any | null> {
  const rest = await opslag.get("st:rest");
  return typeof rest === "string" ? JSON.parse(rest) : null;
}

// ---------------------------------------------------------------- caches
export type OgCache = Record<string, [string, number]>;
/** Regels ouder dan 3 dagen eruit en maximaal OG_MAX (de nieuwste blijven). */
export function ruimOg(c: OgCache, nu: number): OgCache {
  const l = Object.entries(c).filter(([, [, at]]) => nu - at < OG_TTL_MS);
  if (l.length > OG_MAX) l.sort((a, b) => b[1][1] - a[1][1]).length = OG_MAX;
  return Object.fromEntries(l);
}
export const ogVers = (c: OgCache, sleutel: string, nu: number) => { const r = c[sleutel]; return r && nu - r[1] < OG_TTL_MS ? r : undefined; };

export type IgCache = { map: Record<string, [string, number]>; vuil: boolean };
export function ruimIg(map: IgCache["map"], nu: number): IgCache["map"] {
  return Object.fromEntries(Object.entries(map).filter(([, [, at]]) => nu - at < IG_TTL_MS));
}
