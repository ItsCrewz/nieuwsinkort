import { Icon, type IconName } from "./icons";
import { cap } from "./nieuws-hulp";
import { dayDates } from "./tijd";
import type { Weer } from "./types";
import { BionicText } from "./ui";
import { veiligeUrl } from "./url";

// ---------------------------------------------------------------- weer
export type Kind = "sun" | "rain" | "partly" | "cloud";

export function weatherKind(s?: string): Kind {
  const t = (s || "").toLowerCase();
  if (/half|wisselend|opklaring|zon en wolk|licht bewolkt|af en toe zon/.test(t)) return "partly";
  if (/regen|bui|motregen|onweer|hagel|sneeuw|natte/.test(t)) return "rain";
  if (/zon|helder|onbewolkt/.test(t)) return "sun";
  return "cloud";
}

export const KIND_CLASS: Record<Kind, string> = { sun: "ic-sun", rain: "ic-rain", partly: "ic-partly", cloud: "" };

export function WarnBanner({ text }: { text: string }) {
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

export function WeatherBox({ W, bionic }: { W?: Weer; bionic: boolean }) {
  const nu = W?.nu ?? {};
  const vd = W?.vandaag ?? {};
  const dagen = (Array.isArray(W?.dagen) ? W.dagen : []).filter((d) => d && (typeof d.min === "number" || typeof d.max === "number"));
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
