import { artikelPad } from "./artikelid";
// Zonder bruikbare artikellink (bronloos bericht zonder id) delen we de homepage, nooit een link die naar een ander bericht kan wijzen.
export const artikelUrl = (item: Parameters<typeof artikelPad>[0], dag: string) => { const pad = artikelPad(item, dag); return pad ? `https://nieuwsinkort.nl${pad}` : "https://nieuwsinkort.nl/"; };
type DeelNavigator = { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean; clipboard?: { writeText: (tekst: string) => Promise<void> } };
export async function deel(navigator: DeelNavigator, titel: string, url: string): Promise<"gedeeld" | "gekopieerd" | "handmatig" | "geannuleerd"> {
  if (navigator.share && (!navigator.canShare || navigator.canShare({ url }))) {
    try { await navigator.share({ title: titel, url }); return "gedeeld"; } catch (e) { if (e instanceof Error && e.name === "AbortError") return "geannuleerd"; }
  }
  try { if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(url); return "gekopieerd"; } catch { return "handmatig"; }
}
// Deeltitel en zichtbare melding: zonder eigen link wijst de link naar de homepage, dat zeggen we in elk deelpad (ook native delen en handmatig kopiëren) en sturen we de berichtkop niet mee.
export const GEEN_LINK = "Dit bericht heeft geen eigen link: je deelt de link naar Nieuws in het kort.";
export const deelTitel = (kop: string, eigenLink: boolean) => eigenLink ? kop : "Nieuws in het kort";
export function deelMelding(status: string, eigenLink: boolean): string {
  const basis = status === "gekopieerd" ? "Link gekopieerd" : status === "handmatig" ? "Kopieer de link handmatig" : "";
  if (status !== "gekopieerd" && status !== "handmatig" && status !== "gedeeld") return "";
  return eigenLink ? basis : `${basis ? basis + ". " : ""}${GEEN_LINK}`;
}
