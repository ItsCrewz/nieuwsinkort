import { readFile } from "node:fs/promises";
import { isIP } from "node:net";

const data = JSON.parse(await readFile("public/bronnen.json", "utf8"));
let aantal = 0;
let fouten = 0;
for (const groep of data.groepen) for (const bron of groep.bronnen) for (const feed of bron.feeds || []) {
  aantal++;
  try {
    const url = new URL(feed.url);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password || isIP(host.replace(/^\[|\]$/g, "")) || host.length > 253 || !host.includes(".") || !host.split(".").every((deel) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(deel))) throw new Error();
  } catch {
    console.error(`Ongeldige bron-URL bij ${groep.id}/${bron.id}: ${feed.url}`);
    fouten++;
  }
}
if (!aantal) throw new Error("Geen bron-URL's gevonden");
console.log(`${aantal} bron-URL's gecontroleerd; ${fouten} fouten.`);
if (fouten) process.exitCode = 1;
