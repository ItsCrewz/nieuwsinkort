// Rooktest voor productie of een Pages-preview, zonder AI-aanroepen.
import { pathToFileURL } from "node:url";
import { basename } from "node:path";

export async function rooktest(basis = "https://nieuwsinkort.nl", ophalen = fetch, timeout = 10000) {
  const origin = new URL(basis).origin;
  async function verzoek(pad) {
    const signaal = AbortSignal.timeout(timeout);
    try {
      const antwoord = await ophalen(new URL(pad, origin), { redirect: "manual", signal: signaal });
      if (antwoord.status !== 200) throw new Error(`HTTP ${antwoord.status}, verwacht 200`);
      return await antwoord.text();
    } catch (fout) {
      throw new Error(`${pad}: ${signaal.aborted ? "timeout na 10 seconden" : fout.message}`, { cause: fout });
    }
  }

  await verzoek("/");
  const tekst = await verzoek("/data.json");
  let data;
  try { data = JSON.parse(tekst); } catch { throw new Error("/data.json: ongeldige JSON"); }
  if (!Array.isArray(data?.items) || data.items.length < 20) throw new Error("/data.json: minder dan 20 items");
  const html = await verzoek("/vandaag");
  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["'](\/bericht\/[^"'<>\s]+)["'][^>]*>\s*([^<\s][^<]*)<\/a\s*>/gi)];
  if (links.length < 10) throw new Error(`/vandaag: ${links.length} koppen gevonden, minimaal 10 nodig`);
  await verzoek("/over");
  await verzoek(links[0][1].replace(/&amp;/g, "&"));
}

if (process.argv[1] && basename(process.argv[1]) === "rooktest-live.mjs" && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await rooktest(process.argv[2]);
    console.log("Rooktest geslaagd: pagina's, feed en bericht zijn beschikbaar.");
  } catch (fout) {
    console.error(`Rooktest mislukt: ${fout.message}`);
    process.exitCode = 1;
  }
}
