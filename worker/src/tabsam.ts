import { chat, type Usage } from "./ai";

export type TabArtikel = { cat: string; kop: string; ai?: string };
export type TabSam = { tekst: string; ai: boolean; bron: string; gegenereerd: string };
type KV = { get(key: string): Promise<string | null>; put(key: string, value: string, opts: { expirationTtl: number }): Promise<unknown> };

export async function tabSleutel(tab: string, items: TabArtikel[]): Promise<string> {
  const inhoud = items.map((i) => JSON.stringify([i.cat, i.kop, i.ai || ""])).sort().join("\n");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inhoud));
  return `tabsam:${tab}:${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function maakTabSam(kv: KV, tab: string, items: TabArtikel[], now: number, maak?: () => Promise<{ tekst: string; bron: string }>): Promise<{ sam: TabSam; geschreven: boolean }> {
  const key = await tabSleutel(tab, items);
  try {
    const cached = JSON.parse(await kv.get(key) || "null");
    if (cached?.tekst && cached.ai === true) return { sam: cached, geschreven: false };
  } catch { /* zonder cache verder */ }
  let tekst = "", bron = "extractief";
  if (maak) try { ({ tekst, bron } = await maak()); } catch { /* extractieve terugval */ }
  const ai = !!tekst;
  if (!tekst) tekst = items.slice(0, 3).map((i) => (i.ai || i.kop).trim().replace(/[.!?…]*$/, ".")).join(" ");
  const sam = { tekst, ai, bron, gegenereerd: new Date(now).toISOString() };
  // Extractieve tekst niet cachen: bij een volgende run mag AI opnieuw proberen.
  if (ai) try { await kv.put(key, JSON.stringify(sam), { expirationTtl: 86400 }); return { sam, geschreven: true }; } catch { console.error("KV-schrijffout tabsamenvatting"); }
  return { sam, geschreven: false };
}

export async function tabTekst(ai: Ai, model: string, items: TabArtikel[], usage: Usage): Promise<string> {
  const regels = items.map((i) => `${i.kop}: ${i.ai || ""}`).join("\n");
  return (await chat(ai, model, "Schrijf in eenvoudig Nederlands op B1-niveau. Gebruik korte zinnen en gewone woorden. Gebruik alleen feiten uit de berichten. Geef geen kop of opsomming.", `Geef een overzicht van deze berichten in 2 tot 4 korte zinnen.\n${regels}`, 180, usage)).replace(/\s+/g, " ").trim();
}
