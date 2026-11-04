import { artikelPad } from "./artikelid";
export const artikelUrl = (item: Parameters<typeof artikelPad>[0], dag: string) => `https://nieuwsinkort.nl${artikelPad(item, dag)}`;
type DeelNavigator = { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean; clipboard?: { writeText: (tekst: string) => Promise<void> } };
export async function deel(navigator: DeelNavigator, titel: string, url: string): Promise<"gedeeld" | "gekopieerd" | "handmatig" | "geannuleerd"> {
  if (navigator.share && (!navigator.canShare || navigator.canShare({ url }))) {
    try { await navigator.share({ title: titel, url }); return "gedeeld"; } catch (e) { if (e instanceof Error && e.name === "AbortError") return "geannuleerd"; }
  }
  try { if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(url); return "gekopieerd"; } catch { return "handmatig"; }
}
