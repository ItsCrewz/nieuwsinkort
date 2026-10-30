export type Cat = "nl" | "buitenland" | "tech" | "haarlem" | "showbizz" | "politiek" | "voetbal" | "f1" | "auto";
export type Bron = { site: string; href: string };
export type Item = {
  cat: Cat;
  kop: string;
  ai: string;
  samenvatting: string;
  punten: string[];
  tijd: string;
  bronnen: Bron[];
  beeld?: string; // oud veld: één afbeelding
  /** Foto's uit alle bronnen van dit bericht (ontdubbeld, eerste = beste). */
  beelden?: string[];
  /** Sleutel voor /meer?k=… : er staat extra tekst klaar achter "Lees verder" (uur-Worker). */
  meer?: string;
};
/** Extra tekst achter "Lees verder" (/meer). */
export type Meer = {
  uitleg?: string[];
  perBron?: { site: string; href: string; punten: string[] }[];
  uittreksel?: { site: string; href: string; alineas: string[] }[];
};
export type WeerDag = { dag: string; min: number; max: number; omschrijving?: string };
export type Weer = {
  plaats: string;
  bijgewerkt: string;
  nu?: { temp?: number; gevoel?: number; omschrijving?: string; van?: number; tot?: number };
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
  /** "short" = kort clipje (YouTube Shorts, Reels, Reddit, X); "journaal" = uitzending/reportage. */
  soort?: Soort;
  /** Zelfde filmpje bij andere bronnen (na ontdubbelen). */
  ook?: Bron2[];
};
export type Bron2 = { bron: string; href: string };
export type Soort = "short" | "journaal";
export type Data = {
  datum: string;
  dag_samenvatting: string;
  weer: Weer;
  filmpjes: Video[];
  samenvattingen?: Record<string, { punten: string[]; bron: "ondertiteling" | "spraak"; sec?: number }>;
  dumpert: Video[];
  items: Item[];
  gegenereerd?: string;
  /** Per bron ("<groep>|<bron-id>" uit bronnen.json): door de pipeline zelf geteld uit de feeds. */
  bronstats?: Record<string, BronStat>;
  /** uur-update: ai = "normaal" | "zuinig" | "krap" | "op" */
  uur?: { gegenereerd?: string; nieuw?: number; model?: string; ai?: string };
};
/** vandaag = items gepubliceerd sinds 00:00 Europe/Amsterdam; null = feed niet bereikbaar/onleesbaar. */
export type BronStat = { vandaag: number | null; laatste?: string; fout?: string; /** laatste keer dat ophalen lukte */ ok?: string };
export type View = "alles" | Cat | "filmpjes" | "dumpert";
