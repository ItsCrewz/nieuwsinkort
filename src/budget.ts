// Logica van de Durable Object `Budget`: enige eigenaar van het slot per video, de video-neuronen per dag en de
// Whisper-rem per uur voor /samenvatting. KV is niet atomair; de shell voert de aanroepen strikt serieel uit (externe KV-I/O opent de input gate).
// Hier zonder cloudflare:workers, zodat het met een kleine in-memory opslag te testen is (shell: worker/src/budget.ts).
export const MAX_WHISPER_UUR = 30; // globale rem: hooguit zoveel Whisper-aanroepen per uur
export const SLOT_TTL = 90e3; // ms; verloopt vanzelf als de Function wegvalt

export interface Opslag {
  get<T = unknown>(k: string): Promise<T | undefined>;
  put(k: string, v: unknown): Promise<void>;
  delete(k: string | string[]): Promise<unknown>;
  list<T = unknown>(o: { prefix: string }): Promise<Map<string, T>>;
}
// spiegel: schrijft het dagtotaal naar KV `vid-neurons:<datum>` (de uur-Worker leest dat); zaad: leest die spiegel bij de eerste keer van de dag
export interface Buiten { spiegel(datum: string, n: number): Promise<void>; zaad(datum: string): Promise<number | null> }
export type Reservering = { datum: string; uur: string; nieuws: number; budget: number; reserve: number; marge: number; schatting: number };

const rond = (n: number) => Math.round(n * 10) / 10;

export class BudgetLogica {
  constructor(private s: Opslag, private buiten: Buiten, private nu: () => number = Date.now) {}

  // Slot per video: bezig => null. Het token voorkomt dat een verlopen eigenaar het slot van een ander vrijgeeft.
  async claim(id: string, ttl = SLOT_TTL): Promise<string | null> {
    const nu = this.nu();
    const sloten = await this.s.list<{ tot: number; tok: string }>({ prefix: "slot:" });
    const oud = [...sloten].filter(([, v]) => v.tot <= nu).map(([k]) => k);
    if (oud.length) await this.s.delete(oud);
    const huidig = sloten.get(`slot:${id}`);
    if (huidig && huidig.tot > nu) return null;
    const tok = crypto.randomUUID();
    await this.s.put(`slot:${id}`, { tot: nu + ttl, tok });
    return tok;
  }
  async geefVrij(id: string, tok: string) {
    const huidig = await this.s.get<{ tok: string }>(`slot:${id}`);
    if (huidig && huidig.tok === tok) await this.s.delete(`slot:${id}`);
  }

  // Video-neuronen van de dag (zonder nieuws).
  async stand(datum: string): Promise<number> {
    const v = await this.s.get<number>(`video:${datum}`);
    if (typeof v === "number") return v;
    const z = await this.buiten.zaad(datum);
    if (z == null) return 0; // KV onleesbaar: niet bewaren, volgende keer opnieuw proberen
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
    await this.s.put(`uur:${r.uur}`, n + 1);
    await this.s.put(`video:${r.datum}`, nieuw);
    // oude dagen en uren opruimen
    const oud = [...(await this.s.list({ prefix: "video:" })).keys(), ...(await this.s.list({ prefix: "uur:" })).keys()].filter((k) => k !== `video:${r.datum}` && k !== `uur:${r.uur}` && !k.startsWith(`uur:${r.datum}T`));
    if (oud.length) await this.s.delete(oud);
    await this.buiten.spiegel(r.datum, nieuw);
    return { ok: true, video: nieuw };
  }

  // Achteraf het echte verbruik verrekenen: delta = echt - gereserveerd (mag negatief zijn).
  async verreken(datum: string, delta: number): Promise<number> {
    const video = await this.stand(datum);
    if (!delta) return video;
    const nieuw = Math.max(0, rond(video + delta));
    await this.s.put(`video:${datum}`, nieuw);
    await this.buiten.spiegel(datum, nieuw);
    return nieuw;
  }
}
