import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Meer, Bron, Data, Item, View, Weer, WeerDag } from "./types";
import { BionicText, FocusSwitch, host } from "./ui";
import { buildSources, useCatalog, useFiltered, useSourceFilter } from "./sources";
import { SourcesSheet } from "./sheet";
import { Icon, IconSprite, type IconName } from "./icons";
import { VideoGrid, playerFor, soortVan, startSoort } from "./video";
import { useVoorladen } from "./usevoorladen";
import { videoSlug } from "./slug";
import { zaaiSamenvattingen } from "./samenvattingcache";
import { schoon } from "./schoon";
import { Beelden, Thumb } from "./beelden";
import { FilterBalk, FilterBlad, filterNieuws, filterVideos, useFilters } from "./filters";
import { veiligeUrl } from "./url";
import { herindeel } from "./regio";
import { detailInhoud, heeftLeesVerder } from "./leesverder";
import { uitgebreidAlineas } from "./uitgebreid";
import { touchNu } from "./invoer";
import { laadData, neemVroegeData } from "./vroeg";
import { CAT_LABEL, tabOpties, volgendeTab, type TabOpt } from "./tabs";
import { TabBriefing, kopKompact } from "./tabbriefing";
import { parseHash, viewHash, type Route } from "./route";
import { FeedNavigatie } from "./feednavigatie";
import { LeegMelding } from "./leegmelding";

const fotos = (it: Item): string[] => (it.beelden?.length ? it.beelden : it.beeld ? [it.beeld] : []);

const ALLES_FIRST = 24; // op "Home" eerst zoveel kaarten, daarna "Toon alle"
const BIONIC_KEY = "dagelijks-nieuws-focus-lezen-v2";
const THEME_KEY = "nieuwsinkort-thema";
let openedInside = false;
// feed geopend vanuit het overzicht (dan is sluiten = history.back())
let feedPushed = false;
// Intro-animatie alleen bij de eerste keer laden; daarna (tabwissel, herladen) niet opnieuw.
let introDone = false;

// ---------------------------------------------------------------- helpers
function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
const itemKey = (i: Item) => slugify(i.kop) || i.bronnen?.[0]?.href || i.kop;

function bronLabel(bronnen: Bron[]) {
  const names: string[] = [];
  for (const b of bronnen ?? []) if (!names.includes(b.site)) names.push(b.site);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1}`;
}
const bronnenTekst = (n: number) => `${n} ${n === 1 ? "bron" : "bronnen"}`;

const motionOK = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function amsterdamTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// De oude Alles-route vervangen zonder een extra geschiedenisitem.
function huidigeRoute(): Route {
  if (window.location.hash === "#/alles") {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#/`);
  }
  return parseHash(window.location.hash);
}

// ---------------------------------------------------------------- weer
type Kind = "sun" | "rain" | "partly" | "cloud";
function weatherKind(s?: string): Kind {
  const t = (s || "").toLowerCase();
  if (/half|wisselend|opklaring|zon en wolk|licht bewolkt|af en toe zon/.test(t)) return "partly";
  if (/regen|bui|motregen|onweer|hagel|sneeuw|natte/.test(t)) return "rain";
  if (/zon|helder|onbewolkt/.test(t)) return "sun";
  return "cloud";
}
const KIND_CLASS: Record<Kind, string> = { sun: "ic-sun", rain: "ic-rain", partly: "ic-partly", cloud: "" };
const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MO = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function dayDates(dagen: WeerDag[]) {
  // koppel "do", "vr"… aan de eerstvolgende datums (vanaf morgen)
  const out: string[] = [];
  const cur = new Date();
  for (const d of dagen) {
    const want = WD.indexOf((d.dag || "").slice(0, 2).toLowerCase());
    if (want < 0) {
      out.push("");
      continue;
    }
    for (let k = 0; k < 8; k++) {
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() === want) break;
    }
    out.push(`${cur.getDate()} ${MO[cur.getMonth()]}`);
  }
  return out;
}

function WarnBanner({ text }: { text: string }) {
  const t = text.toLowerCase();
  const lvl = t.includes("rood") ? "lvl-rood" : t.includes("oranje") ? "lvl-oranje" : "";
  const m = /^(.{0,80}?[.:])\s+(.*)$/s.exec(text);
  return (
    <div className={`alert ${lvl}`} role="status">
      <Icon name="alert" className="sm" />
      <div>{m ? <><strong>{m[1]}</strong> {m[2]}</> : <strong>{text}</strong>}</div>
    </div>
  );
}

function WeatherBox({ W, bionic }: { W?: Weer; bionic: boolean }) {
  const nu = W?.nu ?? {};
  const vd = W?.vandaag ?? {};
  const dagen = (W?.dagen ?? []).filter((d) => d && (typeof d.min === "number" || typeof d.max === "number"));
  const heeftNu = typeof nu.temp === "number";
  const stats: { k: string; v: string }[] = [];
  if (typeof nu.van === "number" && typeof nu.tot === "number" && nu.van !== nu.tot) stats.push({ k: "Nu in het land", v: `${nu.van}° tot ${nu.tot}°` });
  if (typeof vd.min === "number" || typeof vd.max === "number")
    stats.push({ k: "Vandaag", v: `${typeof vd.min === "number" ? `${vd.min}°` : "–"} / ${typeof vd.max === "number" ? `${vd.max}°` : "–"}` });
  if (typeof vd.neerslagkans === "number") stats.push({ k: "Neerslag", v: `${vd.neerslagkans}%` });
  if (vd.wind) stats.push({ k: "Wind", v: vd.wind });
  const leeg = !W || (!heeftNu && stats.length === 0 && !W.verwachting && dagen.length === 0 && !W.waarschuwing);
  const plaats = W?.plaats || "Nederland";
  const kind = weatherKind(nu.omschrijving);
  const dates = dayDates(dagen.slice(0, 4));
  return (
    <section className="wx" aria-label={`Weer in ${plaats === "Nederland" ? "heel Nederland" : plaats}`}>
      <div className="wx-head">
        <h2 className="kicker">Weer · {plaats}</h2>
        {W?.bijgewerkt ? <span className="wx-upd tnum">{W.bijgewerkt}</span> : null}
      </div>
      {W?.waarschuwing ? <WarnBanner text={W.waarschuwing} /> : null}
      {leeg ? (
        <p className="wx-empty">Het weerbericht is er nu even niet. Kom straks nog eens kijken.</p>
      ) : (
        <>
          {heeftNu ? (
            <div className="wx-now">
              <span className="wx-temp tnum">{nu.temp}°</span>
              <div className="wx-cond">
                <Icon name={kind as IconName} className={`wx-icon ${KIND_CLASS[kind]}`} />
                <span>
                  {nu.omschrijving || ""}
                  {typeof nu.gevoel === "number" ? (
                    <>
                      <br />
                      <span className="muted">voelt als {nu.gevoel}°</span>
                    </>
                  ) : null}
                </span>
              </div>
            </div>
          ) : null}
          {W?.verwachting ? (
            <p className="wx-text bn">
              <BionicText text={W.verwachting} on={bionic} />
            </p>
          ) : null}
          {stats.length ? (
            <dl className="wx-stats">
              {stats.map((s) => (
                <div key={s.k}>
                  <dt>{s.k}</dt>
                  <dd className="tnum">{s.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {dagen.length ? (
            <ol className="wx-days" style={{ gridTemplateColumns: `repeat(${Math.min(dagen.length, 4)},minmax(0,1fr))` }}>
              {dagen.slice(0, 4).map((d, i) => {
                const k = weatherKind(d.omschrijving);
                const label = d.omschrijving || { sun: "Zonnig", rain: "Regen", partly: "Half bewolkt", cloud: "Bewolkt" }[k];
                return (
                  <li className="day" key={d.dag + i} title={label}>
                    <span className="dn">{cap(d.dag)}</span>
                    <span className="dd tnum">{dates[i] || ""}</span>
                    <Icon name={k} className={KIND_CLASS[k]} label={label} />
                    <span className="hl tnum">
                      <b>{typeof d.max === "number" ? `${d.max}°` : "–"}</b> {typeof d.min === "number" ? `${d.min}°` : "–"}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      )}
      {W?.bronnen?.length ? (
        <div className="wx-src">
          Bron:{" "}
          {W.bronnen.map((b, i) => (
            <span key={b.href}>
              {i ? ", " : ""}
              <a href={veiligeUrl(b.href)} target="_blank" rel="noreferrer">
                {b.site}
              </a>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Briefing({ text, bionic, sources, time, note }: { text: string; bionic: boolean; sources: number; time: string; note?: string }) {
  return (
    <section className="brief" aria-label="In het kort">
      <h2 className="kicker">In het kort</h2>
      {text ? (
        <p className="brief-text bn">
          <BionicText text={text} on={bionic} />
        </p>
      ) : (
        <p className="brief-text muted">De samenvatting van vandaag komt er zo aan.</p>
      )}
      {sources > 0 ? (
        <p className="brief-meta">
          Samengevat uit {bronnenTekst(sources)}
          {time ? <> · <span className="tnum">{time}</span></> : null}
        </p>
      ) : null}
      {note ? <p className="brief-note">{note}</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- tabs
// Gesegmenteerde rubriekkeuze. Past alles niet op één regel, dan gaan de laatste rubrieken in "Meer"
// (er scrollt dus niets zijwaarts in de header). De actieve rubriek staat altijd zichtbaar.
function Tabs({ data, view, onChange }: { data: Data; view: View; onChange: (v: View) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const prev = useRef<{ x: number; w: number } | null>(null);
  const [fit, setFit] = useState<{ short: boolean; count: number }>({ short: false, count: 99 });
  const [open, setOpen] = useState(false);
  const options: TabOpt[] = useMemo(() => tabOpties(data.items, view), [data.items, view]);
  const activeIdx = Math.max(0, options.findIndex((o) => o.value === view));

  // Welke tabs passen? Meten in een onzichtbare kopie (vaste breedtes, geen layout-sprongen in beeld).
  const compute = useCallback(() => {
    const wrap = wrapRef.current;
    const m = measureRef.current;
    if (!wrap || !m) return;
    const avail = wrap.clientWidth;
    const pick = (short: boolean) => {
      const row = m.querySelector<HTMLElement>(short ? ".m-short" : ".m-long");
      if (!row) return null;
      const kids = [...row.children] as HTMLElement[];
      const pad = 6; // binnenrand van de track
      const ws = kids.slice(0, options.length).map((k) => k.offsetWidth);
      const meer = kids[options.length]?.offsetWidth ?? 70;
      const total = ws.reduce((a, b) => a + b, 0) + pad;
      if (total <= avail) return options.length;
      let k = options.length - 1;
      const need = (n: number) => {
        let sum = ws.slice(0, n).reduce((a, b) => a + b, 0);
        if (activeIdx >= n) sum += ws[activeIdx];
        return sum + meer + pad;
      };
      while (k > 1 && need(k) > avail) k--;
      return k;
    };
    const long = avail >= 560 ? pick(false) : null;
    if (long !== null && long === options.length) setFit((f) => (f.short || f.count !== long ? { short: false, count: long } : f));
    else {
      const k = pick(true) ?? options.length;
      setFit((f) => (!f.short || f.count !== k ? { short: true, count: k } : f));
    }
  }, [options, activeIdx]);
  useLayoutEffect(() => compute(), [compute]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(wrap);
    document.fonts?.ready.then(() => compute()).catch(() => {});
    return () => ro.disconnect();
  }, [compute]);

  const shown = options.filter((_, i) => i < fit.count || i === activeIdx);
  const rest = options.filter((o) => !shown.includes(o));

  // Pil-indicator: breedte staat stil op de eindmaat; de beweging is een FLIP met alleen transform.
  const place = useCallback((sel: HTMLElement | null, animate: boolean) => {
    const ind = indRef.current;
    if (!ind || !sel) return;
    const x = sel.offsetLeft;
    const w = sel.offsetWidth;
    const from = prev.current;
    prev.current = { x, w };
    if (from && from.x === x && from.w === w && ind.classList.contains("ready")) return;
    ind.style.width = `${w}px`;
    if (animate && from && motionOK()) {
      ind.style.transition = "none";
      ind.style.transform = `translate3d(${from.x}px,0,0) scaleX(${from.w / w})`;
      void ind.offsetWidth;
      ind.style.transition = "";
    }
    ind.style.transform = `translate3d(${x}px,0,0)`;
    ind.classList.add("ready");
  }, []);
  const firstPlace = useRef(true);
  useLayoutEffect(() => {
    place(listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null, !firstPlace.current);
    firstPlace.current = false;
  }, [view, fit, place]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const label = (o: TabOpt) => (fit.short ? o.short : o.label);
  return (
    <nav className="tabs" aria-label="Rubrieken">
      <div className="tabs-in" ref={wrapRef}>
        <div className="seg" ref={listRef}>
          <span className="seg-ind" ref={indRef} aria-hidden="true" />
          <div className="seg-tabs" role="tablist" aria-label="Rubrieken">
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`tab cat-${o.id}`}
              role="tab"
              aria-selected={view === o.value}
              tabIndex={view === o.value ? 0 : -1}
              onKeyDown={(e) => {
                const tabs = [...e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
                const i = tabs.indexOf(e.currentTarget);
                const volgende = volgendeTab(i, tabs.length, e.key);
                if (volgende === null) return;
                e.preventDefault();
                const next = tabs[volgende];
                next.focus();
                next.click();
              }}
              onClick={(e) => {
                place(e.currentTarget, true); // meteen bewegen, de inhoud volgt
                onChange(o.value);
              }}
            >
              {label(o)}
            </button>
          ))}
          </div>
          {rest.length ? (
            <div className="more-wrap" ref={moreRef}>
              <button type="button" className={`tab more-btn ${open ? "open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                Meer <Icon name="chevdown" className="sm" />
              </button>
              {open ? (
                <div className="menu" role="menu">
                  {rest.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        setOpen(false);
                        onChange(o.value);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="seg-measure" ref={measureRef} aria-hidden="true">
          {[false, true].map((short) => (
            <div key={String(short)} className={`seg ${short ? "m-short" : "m-long"}`}>
              {options.map((o) => (
                <span key={o.value} className="tab-m">
                  {short ? o.short : o.label}
                </span>
              ))}
              <span className="tab-m">
                Meer <Icon name="chevdown" className="sm" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- nieuws
function sortItems(items: Item[]) {
  return items.slice().sort((a, b) => {
    if (!a.tijd !== !b.tijd) return a.tijd ? -1 : 1;
    return a.tijd < b.tijd ? 1 : a.tijd > b.tijd ? -1 : 0;
  });
}
// Openingsverhaal: het bericht met de meeste bronnen (meest gedekt), bij gelijkspel het nieuwste.
function pickLead(sorted: Item[]) {
  let best = -1;
  let n = -1;
  sorted.forEach((it, i) => {
    const c = new Set((it.bronnen ?? []).map((b) => b.site)).size;
    if (c > n) {
      n = c;
      best = i;
    }
  });
  return best;
}

type OpenFn = (k: string) => void;
function useOpen(key: string, onOpen: OpenFn) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(key);
  };
}

const LeadStory = memo(function LeadStory({ item, bionic, enter, onOpen }: { item: Item; bionic: boolean; enter: boolean; onOpen: OpenFn }) {
  const key = itemKey(item);
  const click = useOpen(key, onOpen);
  const n = item.bronnen?.length ?? 0;
  return (
    <a className={`lead cat-${item.cat} ${enter ? "enter" : ""}`} data-id={key} href={`#/bericht/${key}`} onClick={click}>
      {fotos(item).length ? <Beelden urls={fotos(item)} eager className="lead-img" /> : null}
      <div className="meta">
        {CAT_LABEL[item.cat] ?? item.cat}
        {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
        {item.ruw ? <span>nog niet samengevat</span> : null}
      </div>
      <h2 className="lead-title">{item.kop}</h2>
      {item.ai ? (
        <p className="lead-sum bn">
          <BionicText text={item.ai} on={bionic} />
        </p>
      ) : null}
      <div className="row-foot">
        <span className="src">{n > 0 ? `${bronLabel(item.bronnen)} · ${bronnenTekst(n)}` : "Geen bron"}</span>
      </div>
    </a>
  );
});

const NewsRow = memo(function NewsRow({ item, i, bionic, enter, onOpen }: { item: Item; i: number; bionic: boolean; enter: boolean; onOpen: OpenFn }) {
  const key = itemKey(item);
  const click = useOpen(key, onOpen);
  const n = item.bronnen?.length ?? 0;
  const anim = enter && i < 12;
  return (
    <a
      className={`row cat-${item.cat} ${anim ? "enter" : ""} ${fotos(item).length ? "has-img" : ""}`}
      data-id={key}
      href={`#/bericht/${key}`}
      style={anim ? ({ "--i": i + 1 } as React.CSSProperties) : undefined}
      onClick={click}
    >
      {fotos(item).length ? <Thumb urls={fotos(item)} /> : null}
      <div className="row-main">
        <div className="meta">
          {CAT_LABEL[item.cat] ?? item.cat}
          {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
          {item.ruw ? <span>nog niet samengevat</span> : null}
        </div>
        <h3 className="row-title">{item.kop}</h3>
        {item.ai ? (
          <p className="row-sum bn">
            <BionicText text={item.ai} on={bionic} />
          </p>
        ) : null}
        <div className="row-foot">
          <span className="src" title={(item.bronnen ?? []).map((b) => b.site).join(", ")}>
            {n > 0 ? bronLabel(item.bronnen) : "Geen bron"}
          </span>
        </div>
      </div>
    </a>
  );
});

function NewsList({ items, view, bionic, focusKey, onOpen, keepOrder, empty }: { items: Item[]; view: View; bionic: boolean; focusKey: string | null; onOpen: OpenFn; keepOrder?: boolean; empty?: ReactNode }) {
  const [enter] = useState(() => !introDone && motionOK());
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => (keepOrder ? items : sortItems(items)), [items, keepOrder]);
  const leadIdx = useMemo(() => (keepOrder ? 0 : pickLead(sorted)), [sorted, keepOrder]);
  if (sorted.length === 0)
    return (
      empty ?? <div className="empty">
        <Icon name="clock" />
        Nog geen berichten van vandaag in deze rubriek. Het eerste nieuws van vandaag komt rond 05:00–06:00.
      </div>
    );
  const lead = sorted[leadIdx];
  const rest = sorted.filter((_, i) => i !== leadIdx);
  const limit = view === "alles" && !showAll && rest.length > ALLES_FIRST + 6;
  const focusIdx = focusKey ? rest.findIndex((x) => itemKey(x) === focusKey) : -1;
  const shown = limit && focusIdx < ALLES_FIRST ? rest.slice(0, ALLES_FIRST) : rest;
  return (
    <div className={enter ? "" : "swap"}>
      <LeadStory item={lead} bionic={bionic} enter={enter} onOpen={onOpen} />
      {shown.length ? (
        <div className="rows">
          {shown.map((it, i) => (
            <NewsRow key={itemKey(it)} item={it} i={i} bionic={bionic} enter={enter} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
      {shown.length < rest.length ? (
        <div className="morewrap">
          <button type="button" className="btn" onClick={() => setShowAll(true)}>
            Toon alle {sorted.length} berichten
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- nieuwsfeed (TikTok-achtig)
// Eén bericht per kaart op schermhoogte, met scroll-snap. De bovenbalk en de rubrieken staan vast
// (de pagina zelf scrolt niet); alleen deze lijst scrolt. Beweging: alleen transform/opacity.
// Laat een kaart altijd passen zonder tekst half af te snijden: eerst het grote nummer weg, dan de
// punten, dan de samenvatting inkorten op HELE regels (met …; volledige tekst via "Lees verder"),
// en pas als het dan nog niet past mag de kaart zelf scrollen. De kop wordt nooit ingekort.
function fitCard(el: HTMLElement) {
  const sum = el.querySelector<HTMLElement>(".nc-sum");
  el.classList.remove("fit-imgsm", "fit-imgxs", "fit-noimg", "fit-nopts", "fit-scroll");
  el.querySelectorAll<HTMLElement>(".nc-pts li").forEach((li) => (li.hidden = false));
  if (sum) {
    sum.classList.remove("clamp");
    sum.style.removeProperty("--sum-lines");
  }
  const over = () => el.scrollHeight - el.clientHeight > 1;
  if (!el.clientHeight || !over()) return;
  // eerst de foto kleiner, dan de punten en samenvatting, als laatste de foto weg
  el.classList.add("fit-imgsm");
  if (!over()) return;
  // punten één voor één van achteren weghalen; pas als er geen meer past, de hele lijst weg
  const pts = [...el.querySelectorAll<HTMLElement>(".nc-pts li")];
  for (let k = pts.length - 1; k >= 0 && over(); k--) pts[k].hidden = true;
  if (pts.length && !over()) return;
  if (pts.length) el.classList.add("fit-nopts");
  if (sum) {
    const lh = parseFloat(getComputedStyle(sum).lineHeight) || 26;
    const lines = Math.round(sum.getBoundingClientRect().height / lh);
    let keep = lines - Math.ceil((el.scrollHeight - el.clientHeight) / lh);
    sum.classList.add("clamp");
    for (keep = Math.max(2, Math.min(keep, lines)); ; keep--) {
      sum.style.setProperty("--sum-lines", String(keep));
      if (!over() || keep <= 2) break;
    }
    if (!over()) return;
  }
  if (el.querySelector(".nc-img")) {
    el.classList.add("fit-imgxs");
    if (!over()) return;
    el.classList.add("fit-noimg");
    if (!over()) return;
  }
  el.classList.add("fit-scroll");
}

const KAARTEN_VOORAF = 6, KAARTEN_VOORUIT = 6; // kaarten met inhoud bij de start / vooruit vanaf de huidige kaart

// De <section> blijft altijd staan (zelfde hoogte, scroll-snap, data-id, aria-label); de inhoud wordt pas gemount als de kaart bijna aan de beurt is (zie NewsFeed: `mount`).
const NewsCard = memo(function NewsCard({ item, i, total, bionic, onOpen, leeg }: { item: Item; i: number; total: number; bionic: boolean; onOpen: OpenFn; leeg?: boolean }) {
  const key = itemKey(item);
  return (
    <section className={`nc cat-${item.cat}`} data-id={key} data-i={i} aria-label={`${i + 1} van ${total}: ${item.kop}`}>
      {leeg ? null : <KaartInhoud item={item} i={i} bionic={bionic} onOpen={onOpen} />}
    </section>
  );
});

function KaartInhoud({ item, i, bionic, onOpen }: { item: Item; i: number; bionic: boolean; onOpen: OpenFn }) {
  const key = itemKey(item);
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    // Alleen kaarten in/naast beeld passend maken: 150+ kaarten tegelijk meten blokkeert een iPhone seconden lang.
    let raf = 0, near = false, dirty = true;
    const run = () => {
      dirty = true;
      if (!near) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { dirty = false; fitCard(el); });
    };
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 3 && r.bottom > -innerHeight * 2) { near = true; dirty = false; fitCard(el); }
    const io = new IntersectionObserver((es) => { near = es[es.length - 1].isIntersecting; if (near && dirty) run(); }, { rootMargin: "200% 0px" });
    io.observe(el);
    const ro = new ResizeObserver(run);
    ro.observe(el);
    el.addEventListener("nc-dirty", run);
    document.fonts?.ready.then(run).catch(() => {});
    return () => {
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("nc-dirty", run);
      cancelAnimationFrame(raf);
    };
  }, [bionic, item]);
  const click = useOpen(key, onOpen);
  const beelden = useMemo(() => fotos(item), [item]);
  const refit = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 3 && r.bottom > -innerHeight * 2) requestAnimationFrame(() => fitCard(el));
    else el.dispatchEvent(new Event("nc-dirty")); // wordt bij in-beeld-komen alsnog gepast (ResizeObserver/IO)
  }, []);
  const bronnen = item.bronnen ?? [];
  const first = bronnen[0];
  const sum = item.ai || item.samenvatting;
  const punten = (item.punten ?? []).slice(0, 3);
  const meer = heeftLeesVerder(item);
  return (
    <article ref={cardRef} className={`nc-in ${beelden.length ? "has-img" : "no-img"}`}>
      <div className="nc-body">
      {beelden.length ? <Beelden urls={beelden} eager={i < 2} voorrang={false} /* eerste kaart ligt onder de kop, niet boven de vouw: geen hoge prioriteit */ className="nc-img" onChange={refit} /> : <span className="nc-rule" aria-hidden="true" />}
      <div className="nc-meta">
        <span className="nc-cat">{CAT_LABEL[item.cat] ?? item.cat}</span>
        {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
        {item.ruw ? <span>nog niet samengevat</span> : null}
        <span className="nc-src" title={bronnen.map((b) => b.site).join(", ")}>
          {bronnen.length ? bronLabel(bronnen) : "Geen bron"}
        </span>
      </div>
      <h2 className="nc-title">
        <a href={`#/bericht/${key}`} onClick={click}>
          {item.kop}
        </a>
      </h2>
      {sum ? (
        <p className="nc-sum bn">
          <BionicText text={sum} on={bionic} />
        </p>
      ) : null}
      {punten.length ? (
        <ul className="nc-pts">
          {punten.map((t, k) => (
            <li key={k} className="bn">
              <BionicText text={t} on={bionic} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="nc-act">
        <div className="nc-act-row">
        {meer ? (
          <a className="btn" href={`#/bericht/${key}`} onClick={click} onTouchStart={() => prefetchMeer(item)} onMouseEnter={() => prefetchMeer(item)}>
            Lees verder
          </a>
        ) : null}
        {first ? (
          <a className={`btn${meer ? " ghost" : ""}`} href={veiligeUrl(first.href)} target="_blank" rel="noopener noreferrer">
            <span>Origineel bij {first.site}</span>
            <Icon name="ext" />
          </a>
        ) : null}
        </div>
        {bronnen.length > 1 ? <span className="nc-more">+{bronnen.length - 1} {bronnen.length === 2 ? "bron" : "bronnen"}</span> : null}
      </div>
      </div>
    </article>
  );
}

function NewsFeed({ items, head, bionic, focusKey, onOpen, keepOrder, empty, kompakt, samenvatting }: { items: Item[]; head: ReactNode; kompakt?: boolean; samenvatting?: boolean; bionic: boolean; focusKey: string | null; onOpen: OpenFn; keepOrder?: boolean; empty?: ReactNode }) {
  const sorted = useMemo(() => {
    if (keepOrder) return items;
    const s = sortItems(items);
    const li = pickLead(s);
    return li > 0 ? [s[li], ...s.filter((_, k) => k !== li)] : s;
  }, [items, keepOrder]);
  const ref = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const [idx, setIdx] = useState(-1); // -1 = de "vandaag"-kaart met samenvatting en weer
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const total = sorted.length;
  // Alleen de eerste kaarten + een venster rond de huidige positie krijgen inhoud (DOM 7600 -> ~1500 elementen); lege kaarten houden dezelfde hoogte.
  const focusIdx = focusKey ? sorted.findIndex((x) => itemKey(x) === focusKey) : -1;
  const mountRef = useRef(0);
  mountRef.current = Math.max(mountRef.current, Math.min(total, Math.max(KAARTEN_VOORAF, idx + 1 + KAARTEN_VOORUIT, focusIdx + 1 + KAARTEN_VOORUIT)));
  const mount = mountRef.current;

  // Positie bijhouden: één rAF per scrollframe, state alleen bij een nieuwe kaart; de balk via transform.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const cards = el.querySelectorAll<HTMLElement>(".nc");
      const y = el.scrollTop + el.clientHeight * 0.4;
      let cur = -1;
      for (let k = 0; k < cards.length; k++) if (cards[k].offsetTop <= y) cur = k;
      if (cur !== idxRef.current) setIdx(cur);
      const max = el.scrollHeight - el.clientHeight;
      startRef.current?.classList.toggle("off", el.scrollTop > 60);
      if (railRef.current) railRef.current.style.transform = `scaleY(${max > 0 ? Math.min(1, el.scrollTop / max) : 0})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    read();
    // kaarten krijgen eenmalig hun invlieg-animatie als ze in beeld komen (DOM-klasse, geen React-render)
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("seen")),
      { root: el, threshold: 0.35 }
    );
    el.querySelectorAll(".nc,.nc-head").forEach((n) => io.observe(n));
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [sorted]);

  // Terug uit een bericht: meteen weer op die kaart.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !focusKey) return;
    const n = el.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusKey)}"]`);
    if (n) el.scrollTop = n.offsetTop;
  }, [focusKey]);

  const go = useCallback((to: number) => {
    const el = ref.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>(".nc");
    const k = Math.max(-1, Math.min(cards.length - 1, to));
    el.scrollTo({ top: k < 0 ? 0 : cards[k].offsetTop, behavior: motionOK() ? "smooth" : "auto" });
  }, []);

  // Pijltjes, PageUp/Down, spatie, j/k, Home/End
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[contenteditable],.sheet,.menu,[role=dialog]") || document.querySelector(".sheet,.feed"))) return;
      const k = e.key;
      let to: number | null = null;
      if (k === "ArrowDown" || k === "PageDown" || k === "j" || (k === " " && !e.shiftKey)) to = idxRef.current + 1;
      else if (k === "ArrowUp" || k === "PageUp" || k === "k" || (k === " " && e.shiftKey)) to = idxRef.current - 1;
      else if (k === "Home") to = -1;
      else if (k === "End") to = 1e6;
      if (to === null) return;
      if (t && t.closest(".tabs") && (k === "ArrowUp" || k === "ArrowDown")) return;
      e.preventDefault();
      go(to);
    };
    const onTop = () => go(-1);
    window.addEventListener("keydown", onKey);
    window.addEventListener("nf-top", onTop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("nf-top", onTop);
    };
  }, [go]);

  return (
    <div className="nf-box">
      <div className="nf" ref={ref} tabIndex={-1} aria-label="Berichten, één per scherm">
        <section className={kompakt ? `nc-head kompakt${samenvatting ? " samenvatting" : ""}` : "nc-head"}>{head}</section>
        {total === 0 ? (
          empty ?? <div className="empty">
            <Icon name="clock" />
            Nog geen berichten van vandaag in deze rubriek. Het eerste nieuws van vandaag komt rond 05:00–06:00.
          </div>
        ) : (
          sorted.map((it, i) => <NewsCard key={itemKey(it)} item={it} i={i} total={total} bionic={bionic} onOpen={onOpen} leeg={i >= mount} />)
        )}
        <section className="nc-end">
          <Footer />
        </section>
      </div>
      {total > 0 ? (
        <>
        <FeedNavigatie verborgen={idx < 0}>
          <span className="nf-rail">
            <span ref={railRef} />
          </span>
          <div className={`nf-pos ${idx >= 0 ? "on" : ""}`}>
            <button type="button" className="nf-btn" aria-label="Vorig bericht" onClick={() => go(idx - 1)}>
              <Icon name="chevup" />
            </button>
            <span className="tnum" aria-live="polite">
              {Math.max(1, idx + 1)}/{total}
            </span>
            <button type="button" className="nf-btn" aria-label="Volgend bericht" onClick={() => go(idx + 1)}>
              <Icon name="chevdown" />
            </button>
          </div>
        </FeedNavigatie>
          {idx < 0 ? (
            <button type="button" ref={startRef} className="nf-start" onClick={() => go(0)}>
              {total} berichten
              <Icon name="chevdown" />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function monoOf(site: string) {
  return site.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "•";
}
function SourceRow({ b }: { b: Bron }) {
  const [imgOk, setImgOk] = useState(true);
  const h = host(b.href);
  return (
    <li>
      <a className="srcrow" href={veiligeUrl(b.href)} target="_blank" rel="noopener noreferrer">
        <span className="mono" aria-hidden="true">
          {imgOk && h ? (
            <img src={`https://icons.duckduckgo.com/ip3/${h}.ico`} alt="" width={16} height={16} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
          ) : (
            monoOf(b.site)
          )}
        </span>
        <span className="s-title">{b.site}</span>
        <span className="s-out">{h}</span>
        <Icon name="ext" className="sm" label="Opent in nieuw tabblad" />
      </a>
    </li>
  );
}

// Extra tekst per bericht (/meer), één keer per sessie opgehaald; al vooraf bij aanraken van "Lees verder".
const meerCache = new Map<string, Promise<Meer | null>>();
function prefetchMeer(item: Item): Promise<Meer | null> {
  const k = item.meer;
  if (!k) return Promise.resolve(null);
  let p = meerCache.get(k);
  if (!p) {
    p = fetch(`/meer?k=${encodeURIComponent(k)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Meer>) : null))
      .catch(() => null);
    p.then((m) => { if (!m) meerCache.delete(k); });
    meerCache.set(k, p);
  }
  return p;
}
function useMeer(item: Item): { meer: Meer | null; laden: boolean } {
  const [st, setSt] = useState<{ k?: string; meer: Meer | null; laden: boolean }>({ meer: null, laden: !!item.meer });
  useEffect(() => {
    let weg = false;
    if (!item.meer) { setSt({ meer: null, laden: false }); return; }
    setSt({ k: item.meer, meer: null, laden: true });
    prefetchMeer(item).then((m) => { if (!weg) setSt({ k: item.meer, meer: m, laden: false }); });
    return () => { weg = true; };
  }, [item]);
  return st;
}

function MeerTekst({ item, bionic }: { item: Item; bionic: boolean }) {
  const { meer, laden } = useMeer(item);
  if (laden) return <div className="d-meer-laden" aria-busy="true" aria-label="Meer tekst laden"><span /><span /><span /></div>;
  const uitleg = uitgebreidAlineas(item, meer);
  const per = (meer?.perBron ?? []).filter((b) => b.punten?.length);
  // het artikel zelf (met link naar de bron) alleen als er geen AI-uitleg is; de alineas staan dan al onder Uitgebreid
  const uit = meer?.uitleg?.length ? [] : (meer?.uittreksel ?? []).filter((b) => b.alineas?.length);
  return (
    <>
      <section className="d-sec d-meer" aria-label="Uitgebreid">
        <h2 className="d-h">Uitgebreid</h2>
        <div className="d-body bn">
          {uitleg.map((p, n) => (
            <p key={n}>
              <BionicText text={p} on={bionic} />
            </p>
          ))}
        </div>
      </section>
      {per.length ? (
        <section className="d-sec" aria-label="Wat elke bron meldt">
          <h2 className="d-h">Wat elke bron meldt</h2>
          <div className="perbron">
            {per.map((b, n) => (
              <div className="pb" key={b.site + n}>
                <a className="pb-site" href={veiligeUrl(b.href)} target="_blank" rel="noopener noreferrer">
                  {b.site}
                  <Icon name="ext" className="sm" />
                </a>
                <ul className="bn">
                  {b.punten.map((p, k) => (
                    <li key={k}>
                      <BionicText text={p} on={bionic} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {uit.map((b, n) => (
        <section className="d-sec d-meer" key={b.href + n} aria-label={`Bron: ${b.site}`}>
          <a className="btn ghost d-more" href={veiligeUrl(b.href)} target="_blank" rel="noopener noreferrer">
            Lees het hele artikel bij {b.site}
            <Icon name="ext" />
          </a>
        </section>
      ))}
    </>
  );
}

function DetailView({ item, onBack, bionic }: { item: Item; onBack: () => void; bionic: boolean }) {
  useEffect(() => {
    document.title = `${item.kop} · Nieuws in het kort`;
    return () => {
      document.title = "Nieuws in het kort";
    };
  }, [item]);
  const { paragraphs, punten, bronnen } = detailInhoud(item);
  return (
    <article className={`detail cat-${item.cat}`}>
      <button type="button" className="back" onClick={onBack}>
        <Icon name="back" className="sm" />
        Terug naar het nieuws
      </button>
      <header className="d-head">
        <div className="meta">
          {CAT_LABEL[item.cat] ?? item.cat}
          {item.tijd ? <time className="tnum">{item.tijd}</time> : null}
          {item.ruw ? <span>nog niet samengevat</span> : null}
          {bronnen.length ? <span>{bronnenTekst(bronnen.length)}</span> : null}
        </div>
        <h1 className="d-title">{item.kop}</h1>
        {fotos(item).length ? <Beelden urls={fotos(item)} eager className="d-img" /> : null}
        {item.ai ? (
          <p className="d-lead bn">
            <BionicText text={item.ai} on={bionic} />
          </p>
        ) : null}
      </header>
      {paragraphs.length ? (
        <div className="d-body bn">
          {paragraphs.map((p, n) => (
            <p key={n}>
              <BionicText text={p} on={bionic} />
            </p>
          ))}
        </div>
      ) : null}
      {punten.length ? (
        <section className="d-sec" aria-label="Belangrijkste punten">
          <h2 className="d-h">Belangrijkste punten</h2>
          <ol className="points bn">
            {punten.map((p, i) => (
              <li key={i}>
                <BionicText text={p} on={bionic} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <MeerTekst item={item} bionic={bionic} />
      <section className="d-sec" aria-label="Bronnen">
        <h2 className="d-h">Bronnen</h2>
        {bronnen.length ? (
          <ul className="srclist">
            {bronnen.map((b, i) => (
              <SourceRow key={b.href + i} b={b} />
            ))}
          </ul>
        ) : (
          <p className="muted">Geen bronnen bij dit bericht.</p>
        )}
      </section>
    </article>
  );
}

// ---------------------------------------------------------------- data + thema
function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = schoon((await laadData(neemVroegeData())) as Data); // ook hier ontdubbelen: statische data zonder Pages Function
      d.items ??= [];
      d.items = d.items.map(herindeel); // ook statische/oude data: buitenland uit "nl" halen
      d.filmpjes ??= [];
      zaaiSamenvattingen(d.samenvattingen);
      d.dumpert ??= [];
      d.dumpert = d.dumpert.filter((v) => !!playerFor(v)); // alleen echte, afspeelbare filmpjes
      d.filmpjes = d.filmpjes.map((v) => ({ ...v, soort: soortVan(v) })); // Shorts of Journaals
      setData((prev) => (prev && prev.gegenereerd && prev.gegenereerd === d.gegenereerd ? prev : d));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
    // ververs als je terugkomt op het tabblad, en elke 15 minuten
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(load, 15 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [load]);
  return { data, error, reload: load };
}

type Theme = "light" | "dark";
function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}
function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "dark" ? "#0f0f0f" : "#ffffff"));
}
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || savedTheme() || systemTheme());
  useLayoutEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => {
      if (!savedTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  // Direct wisselen: geen kleurovergang op elk element (dat hapert), één repaint en klaar.
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* negeer */
    }
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggle };
}

// ---------------------------------------------------------------- app
function TopBar({
  theme,
  onTheme,
  bionic,
  onBionic,
  onHome,
  onSources,
  filtered,
}: {
  theme: Theme;
  onTheme: () => void;
  bionic: boolean;
  onBionic: (v: boolean) => void;
  onHome: () => void;
  onSources: () => void;
  filtered: number;
}) {
  return (
    <header className="topbar">
      <div className="bar">
        <a
          className="brand"
          href="#/"
          aria-label="Nieuws in het kort, naar de voorpagina"
          onClick={(e) => {
            e.preventDefault();
            onHome();
          }}
        >
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Nieuws in het kort
        </a>
        <div className="ctrls">
          <FocusSwitch value={bionic} onChange={onBionic} />
          <button
            type="button"
            className={`srcbtn ${filtered ? "has" : ""}`}
            onClick={onSources}
            aria-haspopup="dialog"
            aria-label={filtered ? `Bronnen: ${filtered} uit` : "Bronnen"}
            title="Bronnen kiezen"
          >
            <Icon name="sliders" />
            <span className="srcbtn-l">Bronnen</span>
            {filtered ? <span className="badge tnum">{filtered}</span> : null}
          </button>
          <button type="button" className="iconbtn" aria-label={theme === "dark" ? "Schakel naar lichte modus" : "Schakel naar donkere modus"} onClick={onTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </div>
      </div>
    </header>
  );
}

// true zodra data.json van de uur-Worker komt (functions/data.json.ts zet "uur")
let UUR_ACTIEF = false;
function Footer() {
  return (
    <footer className="foot">
      <div className="foot-brand">
        <span className="mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        Nieuws in het kort
      </div>
      <p>Samenvattingen op nieuwsinkort worden gemaakt met AI en kunnen fouten bevatten. Lees bij twijfel altijd de bron.</p>
      <p>Samengevat uit de bronnen die bij elk bericht staan. {UUR_ACTIEF ? "Elk uur bijgewerkt (06:00–23:00)" : "Elke dag om 08:00 en 12:00 bijgewerkt"}, met nieuws vanaf middernacht. nieuwsinkort.nl</p>
    </footer>
  );
}

function Front({ children }: { children: ReactNode }) {
  const [enter] = useState(() => !introDone && motionOK());
  return <div className={`front ${enter ? "enter" : ""}`}>{children}</div>;
}

function Frame({ children, top, feed }: { children: ReactNode; top: ReactNode; feed?: boolean }) {
  return (
    <div className={`app ${feed ? "app-feed" : ""}`}>
      <IconSprite />
      <div className="shell">
        <a className="skip" href="#top" onClick={(e) => { e.preventDefault(); document.getElementById("top")?.focus(); }}>Naar de inhoud</a>
        {top}
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const { data: raw, error, reload } = useData();
  // Rustige melding i.p.v. stil falen: bijwerken mislukt, of de AI-dagruimte is (bijna) op.
  const briefNote = [
    error && raw ? "Bijwerken lukt even niet; je ziet het nieuws van de laatste keer." : "",
    raw?.uur?.ai === "op" ? "Samenvatten lukt even niet meer vandaag (dagruimte op). Nieuwe berichten staan er wel, met de tekst van de bron." : "",
  ].filter(Boolean).join(" ");
  UUR_ACTIEF = Date.now() - Date.parse((raw as any)?.uur?.gegenereerd || "") < 2.5 * 3600e3; // alleen als de uur-run recent draaide
  const { theme, toggle } = useTheme();
  const catalog = useCatalog();
  const { off, setMany, reset } = useSourceFilter();
  const { groups, index } = useMemo(() => buildSources(catalog, raw), [catalog, raw]);
  const filtered = useFiltered(raw, index, off);
  const data = filtered?.data ?? null;
  const [route, setRoute] = useState<Route>(() => huidigeRoute());
  const [bionic, setBionic] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [fsheet, setFsheet] = useState(false);
  const flt = useFilters();
  const vids = useMemo(
    () => (data ? { filmpjes: filterVideos(data.filmpjes, flt.f, flt.vorig, data.gegenereerd), dumpert: filterVideos(data.dumpert, flt.f, flt.vorig, data.gegenereerd) } : null),
    [data, flt.f, flt.vorig]
  );
  useVoorladen(vids, data?.gegenereerd, !!route.video); // Filmpjes/Dumpert vooraf warm, na load en in idle-tijd
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BIONIC_KEY);
      if (saved === "0") setBionic(false);
      else if (saved === "1") setBionic(true);
    } catch {
      /* standaard aan */
    }
    const onHash = () => {
      const next = huidigeRoute();
      const prev = routeRef.current;
      const back = prev.selected && !next.selected ? prev.selected : null;
      // concurrent renderen: de browser blijft frames tekenen terwijl React de nieuwe weergave bouwt
      startTransition(() => {
        setFocusKey(back);
        setRoute(next);
      });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Scroll na het wisselen van pagina: naar boven bij detail, terug naar het bericht bij "terug".
  const prevSel = useRef(route.selected);
  useLayoutEffect(() => {
    const was = prevSel.current;
    prevSel.current = route.selected;
    if (was === route.selected) return;
    if (route.selected) window.scrollTo(0, 0);
    else if (was) {
      const n = document.querySelector(`[data-id="${CSS.escape(was)}"]`);
      if (n) n.scrollIntoView({ block: "center" });
      else window.scrollTo(0, 0);
    }
  }, [route.selected]);

  useEffect(() => {
    if (data) introDone = true;
  }, [data]);

  const setBionicPersist = (v: boolean) => {
    setBionic(v);
    try {
      localStorage.setItem(BIONIC_KEY, v ? "1" : "0");
    } catch {
      /* negeer */
    }
  };
  const setView = (v: View) => {
    // Touch: Filmpjes/Dumpert openen meteen de verticale feed (sluiten gaat naar het overzicht); desktop houdt het overzicht met kopjes.
    if ((v === "filmpjes" || v === "dumpert") && data && touchNu()) {
      // Filmpjes: start in Shorts (of Journaals als er geen shorts zijn); wisselen kan bovenin de feed.
      const fl = vids ?? data;
      const list = v === "filmpjes" ? fl.filmpjes.filter((x) => soortVan(x) === startSoort(fl.filmpjes)) : fl.dumpert;
      if (list.length) {
        feedPushed = false;
        window.location.hash = `#/${v}/${encodeURIComponent(videoSlug(list[0]))}`;
        return;
      }
    }
    if (viewHash(v) === (window.location.hash || "#/")) return;
    window.location.hash = viewHash(v);
  };
  const openFeed = useCallback((cat: "filmpjes" | "dumpert", slug: string) => {
    feedPushed = true;
    window.location.hash = `#/${cat}/${encodeURIComponent(slug)}`;
  }, []);
  const closeFeed = useCallback((cat: "filmpjes" | "dumpert") => {
    if (feedPushed) {
      feedPushed = false;
      window.history.back();
    } else {
      window.location.replace(`${window.location.pathname}${window.location.search}#/${cat}`);
    }
  }, []);
  const open = useCallback((key: string) => {
    openedInside = true;
    window.location.hash = `#/bericht/${key}`;
  }, []);
  const goHome = () => {
    if (window.location.hash && window.location.hash !== "#/" && window.location.hash !== "#") window.location.hash = "#/";
    else {
      window.dispatchEvent(new Event("nf-top"));
      window.scrollTo({ top: 0, behavior: motionOK() ? "smooth" : "auto" });
    }
  };

  const dateline = (
      <div className="dateline">
        <span className="date">{raw ? cap(raw.datum) : "\u00a0"}</span>
        {raw ? (
          <span className="upd">
            <i className={`live ${error ? "off" : ""}`} />
            {amsterdamTime(raw.gegenereerd) ? (
              <>
                Bijgewerkt om <span className="tnum">{amsterdamTime(raw.gegenereerd)}</span>
              </>
            ) : (
              "Bijgewerkt vandaag"
            )}
          </span>
        ) : null}
      </div>
  );
  const isFeedView = !!data && !route.selected && route.view !== "filmpjes" && route.view !== "dumpert";
  const top = (
    <>
      <TopBar theme={theme} onTheme={toggle} bionic={bionic} onBionic={setBionicPersist} onHome={goHome} onSources={() => setSheet(true)} filtered={off.size} />
      {isFeedView ? null : dateline}
      {sheet ? (
        <SourcesSheet groups={groups} weer={raw?.weer?.bronnen ?? []} off={off} setMany={setMany} reset={reset} onClose={() => setSheet(false)} />
      ) : null}
    </>
  );

  if (!data || !raw) {
    return (
      <Frame top={top}>
        <main className="wrap" id="top" tabIndex={-1}>
          {error ? (
            <div className="empty" style={{ marginTop: 24 }}>
              <Icon name="alert" />
              Het nieuws laden lukt even niet.
              <button type="button" className="linkbtn" onClick={reload}>
                Probeer opnieuw
              </button>
            </div>
          ) : (
            <div aria-busy="true" aria-label="Nieuws laden" className="skeleton">
              <div className="front">
                <div>
                  <div className="skel" style={{ width: 90, height: 12 }} />
                  <div className="skel" style={{ height: 22, marginTop: 14 }} />
                  <div className="skel" style={{ height: 22, marginTop: 10 }} />
                  <div className="skel" style={{ height: 22, marginTop: 10, width: "70%" }} />
                </div>
                <div className="skel" style={{ height: 240 }} />
              </div>
              <div className="skel" style={{ height: 40, marginTop: 40 }} />
              {[0, 1, 2].map((i) => (
                <div key={i} className="skel" style={{ height: 96, marginTop: 20 }} />
              ))}
            </div>
          )}
          <Footer />
        </main>
      </Frame>
    );
  }

  // Detail: eerst in de gefilterde lijst (met alleen de actieve bronnen), anders het origineel (directe link).
  const selectedItem = route.selected
    ? data.items.find((i) => itemKey(i) === route.selected) ?? raw.items.find((i) => itemKey(i) === route.selected) ?? null
    : null;

  if (selectedItem) {
    return (
      <Frame top={top}>
        <main className="wrap page-in" id="top" tabIndex={-1} key={`d-${route.selected}`}>
          <DetailView
            item={selectedItem}
            bionic={bionic}
            onBack={() => {
              if (openedInside) window.history.back();
              else window.location.hash = "#/";
            }}
          />
          <Footer />
        </main>
      </Frame>
    );
  }

  const view = route.view;
  const isVideo = view === "filmpjes" || view === "dumpert";
  const kortSources = raw.items.reduce((n, a) => n + (a.bronnen?.length ?? 0), 0);
  const hidden = filtered?.hidden ?? 0;
  const filterNote = off.size ? (
    <div className="filternote" role="status">
      <span>
        {hidden ? `${hidden} ${hidden === 1 ? "bericht" : "berichten"} verborgen` : "Bronnenfilter staat aan"} · {off.size} {off.size === 1 ? "bron" : "bronnen"} uit
      </span>
      <button type="button" className="textbtn" onClick={() => setSheet(true)}>
        Aanpassen
      </button>
      <button type="button" className="textbtn" onClick={reset}>
        Alles tonen
      </button>
    </div>
  ) : null;
  const alles = view === "alles";
  const basisItems = alles ? (flt.f.cats.length ? data.items : data.items.filter((i) => i.cat !== "politiek")) : data.items.filter((i) => i.cat === view);
  const uitkomst = isVideo ? null : filterNieuws(basisItems, flt.f, flt.vorig, raw.gegenereerd, alles);
  const filterLeeg = <LeegMelding aantal={basisItems.length} onAanpassen={() => setFsheet(true)} onReset={flt.reset} />;
  const filterBalk = <FilterBalk u={uitkomst} f={flt.f} alles={alles} video={isVideo} onOpen={() => setFsheet(true)} />;
  const filterBlad = fsheet ? (
    <FilterBlad f={flt.f} set={flt.set} reset={flt.reset} u={uitkomst} bron={basisItems} catBron={data.items} vorig={flt.vorig} alles={alles} video={isVideo} onClose={() => setFsheet(false)} />
  ) : null;
  if (!isVideo) {
    return (
      <Frame top={top} feed>
        <main className="nf-main" id="top" tabIndex={-1}>
          <div className="nf-tabs">
            <div className="wrap">
              <Tabs data={data} view={view} onChange={setView} />
              {filterBalk}
              {filterNote}
            </div>
          </div>
          {filterBlad}
          <NewsFeed
            key={view}
            items={uitkomst!.items}
            keepOrder={flt.f.sort !== "nieuw"}
            empty={filterLeeg}
            bionic={bionic}
            focusKey={focusKey}
            onOpen={open}
            kompakt={kopKompact(alles)}
            samenvatting={!!raw.tab_samenvatting?.[view]?.tekst && basisItems.length > 0}
            head={
              <div className="wrap nc-head-in">
                {dateline}
                <Front>
                  {alles ? <Briefing text={raw.dag_samenvatting} bionic={bionic} sources={kortSources} time={amsterdamTime(raw.gegenereerd)} note={briefNote} /> : <TabBriefing text={raw.tab_samenvatting?.[view]?.tekst} aantal={basisItems.length}><Briefing text={raw.tab_samenvatting?.[view]?.tekst || ""} bionic={bionic} sources={0} time="" /></TabBriefing>}
                  {alles && <WeatherBox W={raw.weer} bionic={bionic} />}
                </Front>
              </div>
            }
          />
        </main>
      </Frame>
    );
  }
  return (
    <Frame top={top}>
      <main className="wrap" id="top" tabIndex={-1}>
        <Front>
          <Briefing text={raw.dag_samenvatting} bionic={bionic} sources={kortSources} time={amsterdamTime(raw.gegenereerd)} note={briefNote} />
        </Front>
        <Tabs data={data} view={view} onChange={setView} />
        {filterBalk}
        {filterBlad}
        {off.size ? (
          <div className="filternote" role="status">
            <span>
              {hidden ? `${hidden} ${hidden === 1 ? "bericht" : "berichten"} verborgen` : "Bronnenfilter staat aan"} · {off.size} {off.size === 1 ? "bron" : "bronnen"} uit
            </span>
            <button type="button" className="textbtn" onClick={() => setSheet(true)}>
              Aanpassen
            </button>
            <button type="button" className="textbtn" onClick={reset}>
              Alles tonen
            </button>
          </div>
        ) : null}
        {isVideo ? (
          <VideoGrid
            key={view}
            cat={view}
            list={view === "filmpjes" ? vids!.filmpjes : vids!.dumpert}
            bionic={bionic}
            bronFilter={view === "filmpjes"}
            enter={!introDone && motionOK()}
            video={route.video}
            onOpen={(slug) => openFeed(view, slug)}
            onCloseFeed={() => closeFeed(view)}
          />
        ) : (
          <NewsList
            key={view}
            view={view}
            items={uitkomst?.items ?? []}
            keepOrder={flt.f.sort !== "nieuw"}
            empty={filterLeeg}
            bionic={bionic}
            focusKey={focusKey}
            onOpen={open}
          />
        )}
        <Footer />
      </main>
    </Frame>
  );
}
