import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { Item } from "./types";
import { BionicText } from "./ui";
import { Icon } from "./icons";
import { Beelden } from "./beelden";
import { toonBekendmaking } from "./bekendmaking";
import { relevantePunten, verzamelUrl } from "./puntenrelevantie";
import { veiligeUrl } from "./url";
import { fotos, heeftLeesVerder } from "./leesverder";
import { CAT_LABEL } from "./tabs";
import { prefetchMeer } from "./meer";
import { markeerDelen } from "./zoek";
import { bronLabel, itemKey } from "./nieuws-hulp";
import { laadDetail } from "./artikel-detail";
import { useOpen, type OpenFn } from "./nieuws-open";

// ---------------------------------------------------------------- nieuwsfeed (TikTok-achtig)
// Eén bericht per kaart op schermhoogte, met scroll-snap. De bovenbalk en de rubrieken staan vast
// (de pagina zelf scrolt niet); alleen deze lijst scrolt. Beweging: alleen transform/opacity.
// Laat een kaart altijd passen zonder tekst half af te snijden: eerst het grote nummer weg, dan de
// punten, dan de samenvatting inkorten op HELE regels (met …; volledige tekst via "Lees verder"),
// en pas als het dan nog niet past mag de kaart zelf scrollen. De kop wordt nooit ingekort.
export function fitCard(el: HTMLElement) {
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

export const KAARTEN_VOORAF = 6, KAARTEN_VOORUIT = 6; // kaarten met inhoud bij de start / vooruit vanaf de huidige kaart

// De kaart blijft altijd staan (zelfde hoogte, scroll-snap, data-id, aria-label); de inhoud wordt pas gemount als de kaart bijna aan de beurt is (zie NewsFeed: `mount`).
export const NewsCard = memo(function NewsCard({ item, i, total, bionic, onOpen, leeg, zoekterm }: { item: Item; i: number; total: number; bionic: boolean; onOpen: OpenFn; leeg?: boolean; zoekterm: string }) {
  const key = itemKey(item);
  return (
    <div className={`nc cat-${item.cat}`} data-id={key} data-i={i} role="group" aria-label={`${i + 1} van ${total}: ${item.kop}`}>
      {leeg ? null : <KaartInhoud item={item} i={i} bionic={bionic} onOpen={onOpen} zoekterm={zoekterm} />}
    </div>
  );
});

function KaartInhoud({ item, i, bionic, onOpen, zoekterm }: { item: Item; i: number; bionic: boolean; onOpen: OpenFn; zoekterm: string }) {
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
  }, [bionic, item, zoekterm]);
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
  const tekst = toonBekendmaking(item);
  const sum = tekst.ai || tekst.samenvatting;
  const punten = (item.bronnen?.some((b) => verzamelUrl(b.href)) ? relevantePunten(item.punten ?? [], item.kop, item.ai, item.samenvatting) : item.punten ?? []).slice(0, 3);
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
        <a href={`#/bericht/${key}`} onClick={click} onPointerDown={laadDetail} onMouseEnter={laadDetail}>
          <ZoekTekst tekst={item.kop} query={zoekterm} />
        </a>
      </h2>
      {sum ? (
        <p className="nc-sum bn">
          <ZoekTekst tekst={sum} query={zoekterm} bionic={bionic} />
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
          <a className="btn" href={`#/bericht/${key}`} onClick={click} onPointerDown={() => { void laadDetail(); void prefetchMeer(item); }} onMouseEnter={() => { void laadDetail(); void prefetchMeer(item); }}>
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

export function ZoekTekst({ tekst, query, bionic = false }: { tekst: string; query: string; bionic?: boolean }) {
  return <>{markeerDelen(tekst, query).map((deel, i) => deel.markeer ? <mark key={i}><BionicText text={deel.tekst} on={bionic} /></mark> : <BionicText key={i} text={deel.tekst} on={bionic} />)}</>;
}
