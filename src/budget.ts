// Logica van de Durable Object `Budget`: enige eigenaar van het slot per video, de video-neuronen per dag en de
// Whisper-rem per uur voor /samenvatting. KV is niet atomair; de shell voert de aanroepen strikt serieel uit (externe KV-I/O opent de input gate).
// Hier zonder cloudflare:workers, zodat het met een kleine in-memory opslag te testen is (shell: worker/src/budget.ts).
import { telOp, type LlmState } from "../worker/src/llm";

export const MAX_WHISPER_UUR = 30; // globale rem: hooguit zoveel Whisper-aanroepen per uur
export const SLOT_TTL = 90e3; // ms; verloopt vanzelf als de Function wegvalt
const SLOT_OPRUIM = 20; // max. sloten die één claim bekijkt om verlopen records op te ruimen

// ---- meting van Workers AI-verbruik (gedeeld door Worker en Pages Function; zie docs/ai-budget.md)
// Cloudflare telt de gratis 10.000 neuronen per UTC-dag (reset 00:00 UTC), niet per Amsterdamse dag.
export const utcDag = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
// Meting 02-11: Cloudflare telt circa 1,06× onze teller; zie docs/ai-budget.md.
export const STANDAARD_NEURON_FACTOR = 1.12;
/** Veiligheidsfactor uit env NEURON_FACTOR (tussen 0,5 en 5). Effectief budget = BUDGET / factor. */
export function neuronFactor(s?: string | number): number {
  const f = Number(s);
  return Number.isFinite(f) && f > 0 ? Math.min(5, Math.max(0.5, f)) : STANDAARD_NEURON_FACTOR;
}
export const TEKENS_PER_TOKEN = 3.5; // grove schatting als de respons geen usage meldt
export const schatTokens = (s: string) => Math.ceil(s.length / TEKENS_PER_TOKEN);

/** Verbruik per run/dag. `geschat` = aantal aanroepen zonder echte `usage.neurons`; `foutN` = geschatte neuronen van mislukte aanroepen. */
export type Meting = { neurons: number; calls: number; fails: number; inTok: number; outTok: number; geschat?: number; foutN?: number };

const tekst = (e: any) => String(e?.message ?? e ?? "");
/** Echte dagquota-fout van Workers AI (code 4006, "daily free allocation ... neurons"): de rest van de UTC-dag is er geen AI meer. */
export const isDagQuota = (e: any) => /\b4006\b|daily free allocation|free allocation|used up your daily|daily (?:neuron|quota|limit|allocation)|neurons?\b.{0,60}(?:daily|exhaust|exceed|used up)|(?:daily|exhaust|exceed).{0,60}\bneurons?\b/i.test(tekst(e));
/** Tijdelijk (rate-limit, capaciteit, time-out): later opnieuw proberen; zegt niets over het dagquotum. */
export const isTijdelijk = (e: any) => !isDagQuota(e) && /\b429\b|rate.?limit|too many requests|capacity|overloaded|temporar|\b3040\b|time.?out|timed out/i.test(tekst(e));
export const aiFout = (e: any): "dagquota" | "tijdelijk" | "overig" => (isDagQuota(e) ? "dagquota" : isTijdelijk(e) ? "tijdelijk" : "overig");

/** Aanroep geslaagd: echte `usage` gebruiken, anders schatten uit tekens en `geschat` ophogen. */
export function meetChat(u: Meting, tarief: [number, number], prompt: string, uit: string, usage?: any) {
  const pt = usage?.prompt_tokens ?? schatTokens(prompt);
  const ct = usage?.completion_tokens ?? schatTokens(uit);
  u.inTok += pt; u.outTok += ct;
  if (typeof usage?.neurons === "number") u.neurons += usage.neurons;
  else { u.neurons += (pt * tarief[0] + ct * tarief[1]) / 1e6; u.geschat = (u.geschat || 0) + 1; }
}
/** Mislukte aanroep telt toch mee: invoer volledig, uitvoer half max_tokens; een afgewezen aanroep (dagquota/tijdelijk) kost geen uitvoer. */
export function meetFout(u: Meting, tarief: [number, number], prompt: string, maxTokens: number, e: any) {
  const pt = schatTokens(prompt), ct = aiFout(e) === "overig" ? Math.ceil(maxTokens / 2) : 0;
  const n = (pt * tarief[0] + ct * tarief[1]) / 1e6;
  u.calls++; u.inTok += pt; u.outTok += ct; u.neurons += n; u.foutN = (u.foutN || 0) + n; u.geschat = (u.geschat || 0) + 1;
}

/** Dagteller in de nieuwsstand (`state`): geldt voor de UTC-dag in `neuronDag` (oude state zonder dat veld: `datum`). */
export type DagTeller = { datum: string; neuronDag?: string; neurons: number; calls: number; inTok?: number; outTok?: number; geschat?: number; foutN?: number };
export const nieuwsNeuronen = (st: DagTeller | null | undefined, utc: string) => (st && (st.neuronDag ?? st.datum) === utc ? +st.neurons || 0 : 0);
/** Begint bij een nieuwe UTC-dag met nullen (muteert). */
export function zetDagTeller(st: DagTeller, utc: string) {
  if ((st.neuronDag ?? st.datum) !== utc) { st.neurons = 0; st.calls = 0; st.inTok = 0; st.outTok = 0; st.geschat = 0; st.foutN = 0; }
  st.neuronDag = utc;
}
/** KV-vlag: Workers AI meldde vandaag (UTC) een echte dagquota-fout; Worker en Function lezen en schrijven die. */
export const quotaSleutel = (utc: string) => `ai-quota:${utc}`;

export interface Opslag {
  get<T = unknown>(k: string): Promise<T | undefined>;
  put(k: string, v: unknown): Promise<void>;
  putMany?(o: Record<string, unknown>): Promise<void>; // atomair (DO-opslag: storage.put({...})); zonder valt reserveer() terug op herstelbaar schrijven
  delete(k: string | string[]): Promise<unknown>;
  list<T = unknown>(o: { prefix: string; limit?: number }): Promise<Map<string, T>>;
}
// spiegel: schrijft het dagtotaal naar KV `vid-neurons:<datum>` (de uur-Worker leest dat); zaad: leest die spiegel bij de eerste keer van de dag
// spiegel geeft `false` als het schrijven mislukte: de logica probeert het bij de volgende aanroep (ook een lezing) opnieuw, zodat de Worker geen verouderde stand blijft lezen
export interface Buiten { spiegel(datum: string, n: number): Promise<void | boolean>; zaad(datum: string): Promise<number | null> }
export type Reservering = { datum: string; uur: string; nieuws: number; budget: number; reserve: number; marge: number; schatting: number };
export interface GroqBuiten { zaad(datum: string): Promise<LlmState>; spiegel(datum: string, stand: LlmState): Promise<boolean> }

const rond = (n: number) => Math.round(n * 10) / 10;

export class BudgetLogica {
  constructor(private s: Opslag, private buiten: Buiten, private nu: () => number = Date.now, private groq?: GroqBuiten) {}

  // Duurzame markering `videovuil:<datum>` (niet in geheugen): de KV-spiegel loopt achter op `video:<datum>`, ook na een herstart.
  // De markering staat er al vóór de externe aanroep (zie `bewaar`), dus een herstart of exceptie midden in de spiegel verliest de achterstand niet; hier wissen we hem alleen bij succes.
  private async spiegel(datum: string, n: number) {
    if ((await this.buiten.spiegel(datum, n)) !== false) await this.s.delete(`videovuil:${datum}`);
  }
  // Markering eerst, dan het totaal: bij een onderbreking kan er hooguit een markering bij het oude totaal staan (onschadelijk: `stand` spiegelt dat opnieuw).
  private async bewaar(datum: string, n: number) {
    await this.s.put(`videovuil:${datum}`, true);
    await this.s.put(`video:${datum}`, n);
  }

  // Uurplaats + markering + dagtotaal als één geheel: atomair via putMany, anders één voor één met `uur:` als laatste
  // en bij een fout de al geschreven sleutels terugzetten, zodat een mislukte reservering niets blijvend verbruikt.
  private async boek(r: Reservering, uurN: number, oudVideo: number, nieuw: number) {
    const uur = `uur:${r.uur}`, vuil = `videovuil:${r.datum}`, vid = `video:${r.datum}`;
    if (this.s.putMany) { await this.s.putMany({ [vuil]: true, [vid]: nieuw, [uur]: uurN + 1 }); return; }
    const oudVuil = await this.s.get<boolean>(vuil);
    const gedaan: Array<() => Promise<unknown>> = [];
    try {
      await this.s.put(vuil, true); gedaan.push(() => (oudVuil === undefined ? this.s.delete(vuil) : this.s.put(vuil, oudVuil)));
      await this.s.put(vid, nieuw); gedaan.push(() => this.s.put(vid, oudVideo));
      await this.s.put(uur, uurN + 1);
    } catch (e) {
      for (const terug of gedaan.reverse()) { try { await terug(); } catch { console.error("budget: terugzetten mislukt"); } }
      throw e;
    }
  }

  // Eén opslagwaarde bewaart ook of een mislukte KV-spiegel nog moet worden hersteld.
  async groqBij(datum: string, verschil: LlmState): Promise<void> {
    if (!this.groq) throw new Error("Groq-spiegel ontbreekt");
    const sleutel = `groq:${datum}`;
    const opgeslagen = await this.s.get<{ stand: LlmState; vuil: boolean }>(sleutel);
    const stand = opgeslagen?.stand ?? await this.groq.zaad(datum);
    const gewijzigd = Object.values(verschil).some((v) => v.calls || v.tokens || v.maandTokens);
    if (gewijzigd) {
      telOp(stand, verschil);
      await this.s.put(sleutel, { stand, vuil: true });
    }
    if ((gewijzigd || opgeslagen?.vuil) && await this.groq.spiegel(datum, stand)) {
      await this.s.put(sleutel, { stand, vuil: false });
    }
  }

  // Slot per video: bezig => null. Het token voorkomt dat een verlopen eigenaar het slot van een ander vrijgeeft.
  // Alleen het gevraagde slot wordt gelezen (geen inventarisatie op het kritieke pad); verlopen sloten ruimt `ruimOp` begrensd op.
  async claim(id: string, ttl = SLOT_TTL): Promise<string | null> {
    const nu = this.nu();
    const sleutel = `slot:${id}`;
    const huidig = await this.s.get<{ tot: number; tok: string }>(sleutel);
    if (huidig && huidig.tot > nu) return null;
    const tok = crypto.randomUUID();
    await this.s.put(sleutel, { tot: nu + ttl, tok });
    await this.ruimOp(sleutel, nu);
    return tok;
  }
  // Hooguit SLOT_OPRUIM sloten per claim bekijken; een fout hier mag de claim niet laten mislukken.
  private async ruimOp(behoud: string, nu: number) {
    try {
      const sloten = await this.s.list<{ tot: number }>({ prefix: "slot:", limit: SLOT_OPRUIM });
      const oud = [...sloten].filter(([k, v]) => k !== behoud && v.tot <= nu).map(([k]) => k);
      if (oud.length) await this.s.delete(oud);
    } catch { console.error("budget: sloten opruimen mislukt"); }
  }
  async geefVrij(id: string, tok: string) {
    const huidig = await this.s.get<{ tok: string }>(`slot:${id}`);
    if (huidig && huidig.tok === tok) await this.s.delete(`slot:${id}`);
  }

  // Video-neuronen van de dag (zonder nieuws).
  async stand(datum: string): Promise<number> {
    const v = await this.s.get<number>(`video:${datum}`);
    if (typeof v === "number") { if (await this.s.get<boolean>(`videovuil:${datum}`)) await this.spiegel(datum, v); return v; }
    const z = await this.buiten.zaad(datum);
    if (z == null) throw new Error("budget: dagstand onleesbaar"); // volgende keer opnieuw lezen
    await this.s.put(`video:${datum}`, z);
    return z;
  }

  // Atomair: past nieuws + video + reserve + marge + schatting binnen het budget en is de uurrem niet vol? Dan reserveren.
  async reserveer(r: Reservering): Promise<{ ok: true; video: number } | { ok: false; reden: "budget" | "druk"; video: number }> {
    const video = await this.stand(r.datum);
    if (r.nieuws + video + r.reserve + r.marge + r.schatting > r.budget) return { ok: false, reden: "budget", video };
    const n = (await this.s.get<number>(`uur:${r.uur}`)) || 0;
    if (n >= MAX_WHISPER_UUR) return { ok: false, reden: "druk", video };
    const nieuw = rond(video + r.schatting);
    await this.boek(r, n, video, nieuw);
    // Oude dagen en uren opruimen. De vorige dag blijft staan: een aanvraag van vóór UTC-middernacht kan nog verrekenen,
    // en zonder die stand zou verreken() hem uit een achterlopende KV-spiegel zaaien. Nieuwere dagen blijven ook staan.
    // Pas na de boeking en afzonderlijk afgevangen: een fout hier mag een geboekte reservering niet alsnog laten mislukken (dan boekt een nieuwe poging dubbel).
    try {
      const vorige = utcDag(Date.parse(r.datum) - 864e5);
      const dagOud = (k: string) => k.slice(k.indexOf(":") + 1) < vorige;
      const oud = [...(await this.s.list({ prefix: "video:" })).keys(), ...(await this.s.list({ prefix: "videovuil:" })).keys()].filter(dagOud)
        .concat([...(await this.s.list({ prefix: "uur:" })).keys()].filter((k) => k !== `uur:${r.uur}` && !k.startsWith(`uur:${r.datum}T`)));
      if (oud.length) await this.s.delete(oud);
    } catch { console.error("budget: opruimen mislukt"); }
    // Spiegelfout apart: de `videovuil`-markering staat er al, `stand` herstelt de spiegel bij de volgende aanroep.
    try { await this.spiegel(r.datum, nieuw); } catch { console.error("budget: KV-spiegel mislukt"); }
    return { ok: true, video: nieuw };
  }

  // Achteraf het echte verbruik verrekenen: delta = echt - gereserveerd (mag negatief zijn).
  async verreken(datum: string, delta: number): Promise<number> {
    const video = await this.stand(datum);
    if (!delta) return video;
    const nieuw = Math.max(0, rond(video + delta));
    await this.bewaar(datum, nieuw);
    await this.spiegel(datum, nieuw);
    return nieuw;
  }
}
