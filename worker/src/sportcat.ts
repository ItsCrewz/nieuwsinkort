// Deel algemeen nieuws conservatief in op basis van bronpad en titel.
type Cat = "f1" | "voetbal" | "auto";
export function sportCat({ cat, kop, hrefs }: { cat: string; kop: string; hrefs: string[] }): Cat | null {
  // Autobronnen publiceren ook F1/voetbal: die cat mag omhoog (F1 > voetbal > auto).
  if (!["nl", "buitenland", "tech", "auto"].includes(cat)) return null;
  const paden = hrefs.map((href) => { try { return new URL(href).pathname.toLowerCase(); } catch { return ""; } });
  const pad = (re: RegExp) => paden.some((p) => re.test(p));
  const f1 = /\b(?:formule\s*1|f1|grand prix|gp|verstappen|lando norris|oscar piastri|charles leclerc|lewis hamilton|george russell|fernando alonso|carlos sainz|kimi antonelli|isack hadjar|red bull racing|pole position|poleposition|pitstop)\b/i.test(kop);
  const club = /\b(?:ajax|psv|feyenoord|az|fc twente)\b/i.test(kop);
  // Samenstellingen (amateurvoetballer, voetbalclub) tellen; "oud-voetballer" niet, want die komt ook in showbizz voor. Losse woorden als club, wedstrijd, race of finale zijn geen signaal.
  const sportpad = pad(/\/(?:nieuws\/)?sport(?:\/|$)/);
  const voetbalWoord = /(?<!oud-)\b(?!oud-)(?:[a-z]+-?)?voetbal(?:l?ers?|sters?|clubs?|bond|stadion|wedstrijd|fans?|supporters?|trainer|competitie|seizoen)?\b/i.test(kop);
  const voetbal = club || voetbalWoord || (sportpad && /\b(?:spits|doelman|aanvaller|middenvelder|scheidsrechter|bondscoach)\b/i.test(kop)) || /\b(?:eredivisie|champions league|europa league|knvb|doelpunt)\b/i.test(kop) || (/\boranje\b/i.test(kop) && /\b(?:voetbal|bondscoach|koeman|wk|ek)\b/i.test(kop));
  if (pad(/(?:\/formule-?1(?:\/|$)|\/formula1(?:\/|$)|\/f1(?:\/|$)|nossportformule1)/) || f1) return "f1";
  if (pad(/\/(?:voetbal|eredivisie|champions-league|football|soccer)(?:\/|$)/) || voetbal) return "voetbal";
  // Motorsport zonder F1 (MotoGP, motorcoureurs) hoort bij Auto.
  if (pad(/\/sport\/(?:motogp|autosport)(?:[\/-]|$)/) || /\b(?:motogp|motorcoureurs?|superbike)\b/i.test(kop) || (sportpad && /\b(?:coureurs?)\b/i.test(kop))) return "auto";
  if (/\b(?:ongeluk|crash|botsing|kop|gewond|politie|brand|a2|snelweg|brandstofprijzen?)\b/i.test(kop)) return null;
  if (pad(/\/(?:auto|autovisie)(?:\/|$)/)) return "auto";
  const woorden = kop.match(/\b(?:automerk|autofabrikant|auto(?:'s)?|ev|rijtest|tesla|volkswagen|bmw|toyota|kia|hyundai|renault|peugeot|volvo|byd|laadpaal|apk)\b/gi) || [];
  return woorden.length >= 2 ? "auto" : null;
}
export function herindeelSport(k: { cat: string; c: { t: string; href: string }[] }): void {
  // Alle titels en bronpaden tellen mee, ook als de oudste bron een algemene feed is.
  k.cat = sportCat({ cat: k.cat, kop: k.c.map((c) => c.t).join(" "), hrefs: k.c.map((c) => c.href) }) || k.cat;
}
