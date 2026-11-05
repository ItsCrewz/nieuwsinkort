// Handmatige meting vanaf de gekozen netwerkverbinding; geen onderdeel van de tests.
const kanaal = process.argv[2];
const gebruiker = process.argv[3];
if (!/^UC[\w-]{22}$/.test(kanaal || "") || (gebruiker && !/^[\w.-]+$/.test(gebruiker))) {
  console.error("Gebruik: node scripts/diagnose-youtube.mjs <kanaal-ID> [oude-gebruikersnaam]");
  process.exit(1);
}
const basis = "https://www.youtube.com/feeds/videos.xml";
const varianten = [["kanaal", `channel_id=${kanaal}`], ["uploads", `playlist_id=UU${kanaal.slice(2)}`]];
if (gebruiker) varianten.push(["gebruiker", `user=${gebruiker}`]);
const accept = "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8, */*;q=0.5";
const uas = ["nieuwsinkort/1.0 (+https://nieuwsinkort.pages.dev)", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"];
for (const [naam, query] of varianten) {
  for (const ua of uas) {
    const url = `${basis}?${query}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua, Accept: accept, "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
      const body = await r.text();
      console.log(JSON.stringify({ variant: naam, url, userAgent: ua, accept, acceptLanguage: "nl-NL,nl;q=0.9,en;q=0.8", status: r.status, contentType: r.headers.get("content-type"), atom: /<feed(?:\s|>)/i.test(body), entries: (body.match(/<entry(?:\s|>)/gi) || []).length }));
    } catch (e) {
      console.log(JSON.stringify({ variant: naam, url, userAgent: ua, fout: e instanceof Error ? e.name : "onbekend" }));
    }
  }
}
