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

/** Inhoud van `uur` zonder vluchtige velden: gegenereerd, meta, tijdstempels `ok` in bronstats, weer.bijgewerkt en gegenereerd per taboverzicht (de extractieve tekst krijgt elke run een nieuwe tijd; de UI toont die niet). */
export function uurInhoud(out: any): string {
  const { gegenereerd: _g, meta: _m, bronstats, weer, tab_samenvatting, ...rest } = out;
  const tabs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tab_samenvatting || {})) { const { gegenereerd: _t, ...r } = (v || {}) as any; tabs[k] = r; }
  const bs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bronstats || {})) { const { ok: _ok, ...r } = v as any; bs[k] = r; }
  let w = weer;
  if (weer && typeof weer === "object") { const { bijgewerkt: _b, ...r } = weer; w = r; }
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
export async function leesState(opslag: Opslag): Promise<{ st: any; json: Record<string, string> } | null> {
  const rest = await opslag.get("st:rest");
  if (typeof rest !== "string") return null;
  const json: Record<string, string> = { "st:rest": rest };
  const st = JSON.parse(rest);
  const delen = await Promise.all(STATE_DELEN.map(async (d) => [d, await opslag.get(sl(d))] as const));
  for (const [d, s] of delen) if (typeof s === "string") { json[sl(d)] = s; st[d] = JSON.parse(s); }
  return { st, json };
}

/** Alleen de gewijzigde delen schrijven; de puts volgen zonder await op elkaar en worden dus als één transactie weggeschreven. Geeft het aantal writes. */
export async function schrijfState(opslag: Opslag, st: Record<string, any>, vorige: Record<string, string>): Promise<number> {
  const nieuw = splitState(st), taken: Promise<unknown>[] = [];
  for (const [k, v] of Object.entries(nieuw)) if (vorige[k] !== v) taken.push(opslag.put(k, v));
  for (const k of Object.keys(vorige)) if (!(k in nieuw)) taken.push(opslag.delete(k));
  await Promise.all(taken);
  return taken.length;
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
