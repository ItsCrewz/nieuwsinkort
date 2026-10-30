// Detailscherm van één bericht (#/bericht/...); lui geladen, het hoofdscherm toont alleen de lijst.
import { useEffect, useRef, useState } from "react";
import type { Bron, Item, Meer } from "./types";
import { BionicText, host } from "./ui";
import { Icon } from "./icons";
import { Beelden } from "./beelden";
import { veiligeUrl } from "./url";
import { bronnenTekst, detailInhoud, fotos } from "./leesverder";
import { uitgebreidAlineas } from "./uitgebreid";
import { AiVermelding, isAiSamenvatting, isAiUitgebreid } from "./ai-vermelding";
import { CAT_LABEL } from "./tabs";
import { prefetchMeer } from "./meer";

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
        <AiVermelding tonen={isAiUitgebreid(item, meer)} />
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

export function DetailView({ item, onBack, bionic }: { item: Item; onBack: () => void; bionic: boolean }) {
  const kopRef = useRef<HTMLHeadingElement>(null);
  // Focus naar de kop bij openen (scrollpositie blijft bovenaan); Escape = terug
  useEffect(() => {
    kopRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [item, onBack]);
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
        <h1 className="d-title" ref={kopRef} tabIndex={-1}>{item.kop}</h1>
        {fotos(item).length ? <Beelden urls={fotos(item)} eager className="d-img" /> : null}
        {item.ai ? (
          <p className="d-lead bn">
            <BionicText text={item.ai} on={bionic} />
          </p>
        ) : null}
        <AiVermelding tonen={!!item.ai && isAiSamenvatting(item)} />
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
      <AiVermelding tonen={paragraphs.length > 0 && isAiSamenvatting(item)} />
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

