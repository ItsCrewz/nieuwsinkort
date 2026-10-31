// Durable Object `Budget`: één instantie ("dag") is de enige eigenaar van slot, video-neuronen en uurrem van
// /samenvatting (Pages Function roept deze aan via de binding BUDGET_DO). Logica: src/budget.ts.
import { DurableObject } from "cloudflare:workers";
import { BudgetLogica, type Reservering } from "../../src/budget";
// meting, foutclassificatie en UTC-dagteller: pure logica in src/budget.ts (ook voor de Pages Function), hier voor de Worker
export { utcDag, neuronFactor, isDagQuota, isTijdelijk, aiFout, meetChat, meetFout, nieuwsNeuronen, zetDagTeller, quotaSleutel, type Meting } from "../../src/budget";

export interface BudgetEnv { NIEUWS: KVNamespace }

export class Budget extends DurableObject<BudgetEnv> {
  private l = new BudgetLogica(this.ctx.storage as any, {
    spiegel: async (datum, n) => {
      try { await this.env.NIEUWS.put(`vid-neurons:${datum}`, String(n), { expirationTtl: 3 * 86400 }); return true; }
      catch { console.error("budget: KV-spiegel schrijven mislukt"); return false; }
    },
    zaad: async (datum) => { try { return +((await this.env.NIEUWS.get(`vid-neurons:${datum}`)) || 0) || 0; } catch { console.error("budget: KV-spiegel lezen mislukt"); return null; } },
  });
  // Mutex: externe I/O (KV-zaad/-spiegel) opent de input gate, dus zonder dit kunnen operaties interleaven en elkaars stand overschrijven.
  private keten: Promise<unknown> = Promise.resolve();
  private serieel<T>(f: () => Promise<T>): Promise<T> {
    const r = this.keten.then(f, f);
    this.keten = r.catch(() => {});
    return r;
  }
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") return new Response("nee", { status: 405 });
    const b: any = await req.json().catch(() => ({}));
    return this.serieel(() => this.doe(new URL(req.url).pathname.slice(1), b));
  }
  private async doe(a: string, b: any): Promise<Response> {
    if (a === "claim" && typeof b.id === "string") return Response.json({ tok: await this.l.claim(b.id) });
    if (a === "vrij" && typeof b.id === "string" && typeof b.tok === "string") { await this.l.geefVrij(b.id, b.tok); return Response.json({ ok: true }); }
    if (a === "stand" && typeof b.datum === "string") return Response.json({ video: await this.l.stand(b.datum) });
    if (a === "reserveer" && typeof b.datum === "string") return Response.json(await this.l.reserveer(b as Reservering));
    if (a === "verreken" && typeof b.datum === "string" && typeof b.delta === "number") return Response.json({ video: await this.l.verreken(b.datum, b.delta) });
    return new Response("onbekend", { status: 404 });
  }
}
