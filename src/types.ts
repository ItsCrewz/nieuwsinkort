export type Cat = "nl" | "tech" | "haarlem" | "showbizz";
export type Bron = { site: string; href: string };
export type Item = {
  cat: Cat;
  kop: string;
  ai: string;
  samenvatting: string;
  punten: string[];
  tijd: string;
  bronnen: Bron[];
  beeld?: string; // optioneel: afbeelding bij het bericht (nu nog niet in de data)
};
export type WeerDag = { dag: string; min: number; max: number; omschrijving?: string };
export type Weer = {
  plaats: string;
  bijgewerkt: string;
  nu?: { temp?: number; gevoel?: number; omschrijving?: string };
  vandaag?: { min?: number; max?: number; neerslagkans?: number; wind?: string };
  verwachting: string;
  waarschuwing: string;
  dagen: WeerDag[];
  bronnen: Bron[];
};
export type Video = {
  titel: string;
  ai: string;
  bron: string;
  href: string;
  embed?: string;
  thumb: string;
  populariteit: string;
  tijd: string;
};
export type Data = {
  datum: string;
  dag_samenvatting: string;
  weer: Weer;
  filmpjes: Video[];
  dumpert: Video[];
  items: Item[];
  gegenereerd?: string;
  /** Per bron ("<groep>|<bron-id>" uit bronnen.json): door de pipeline zelf geteld uit de feeds. */
  bronstats?: Record<string, BronStat>;
};
/** vandaag = items gepubliceerd sinds 00:00 Europe/Amsterdam; null = feed niet bereikbaar/onleesbaar. */
export type BronStat = { vandaag: number | null; laatste?: string; fout?: string };
export type View = "alles" | Cat | "filmpjes" | "dumpert";
