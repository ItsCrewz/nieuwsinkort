// Controleer een Pages-preview of productie zonder AI-aanroepen.
const basis = process.argv[2];
if (!basis) {
  console.error("Gebruik: node scripts/check-status.mjs <basis-url>");
  process.exit(1);
}
const origin = new URL(basis).origin;
let fouten = 0;
async function controleer(pad, status, bevat, opties = {}) {
  try {
    const antwoord = await fetch(new URL(pad, origin), { redirect: "manual", ...opties });
    const tekst = bevat ? await antwoord.text() : "";
    const goed = antwoord.status === status && (!bevat || bevat.test(tekst));
    console.log(`${goed ? "OK" : "FOUT"} ${pad}: ${antwoord.status} (verwacht ${status})`);
    if (!goed) fouten++;
    return tekst;
  } catch (fout) {
    console.error(`FOUT ${pad}: ${fout.message}`);
    fouten++;
    return "";
  }
}
const html = await controleer("/", 200, /<html/i);
const asset = html.match(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/);
if (asset) await controleer(asset[1], 200);
else { console.error("FOUT: geen build-asset gevonden op /"); fouten++; }
await controleer("/fonts/inter-latin.woff2", 200);
await controleer("/data.json", 200, /"/);
await controleer("/bronnen.json", 200, /"/);
await controleer("/samenvatting", 415, /JSON/, { method: "POST" });
await controleer("/meer", 400, /geen sleutel/);
await controleer("/media/dumpert/ongeldig", 404, /^Not found$/);
for (const pad of ["/bestaatniet-xyz", "/404", "/feed", "/manifest.json", "/onbekend/diep"]) {
  await controleer(pad, 404, /Pagina niet gevonden/);
}
process.exitCode = fouten ? 1 : 0;
