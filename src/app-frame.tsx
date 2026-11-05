import { useState,type ReactNode } from "react";
import { Theme,afwijzingen } from "./app-data";
import { intro } from "./app-status";
import { rustig } from "./beweging";
import { debug } from "./debug";
import { Icon,IconSprite } from "./icons";
import { FocusSwitch } from "./ui";



// ---------------------------------------------------------------- app
export function TopBar({
  theme,
  onTheme,
  bionic,
  onBionic,
  onHome,
  onSources,
  filtered,
  zoeken,
}: {
  zoeken?: ReactNode;
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
          {zoeken}
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
export const UUR_ACTIEF = { actief: false };

export function Footer() {
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
      <p>Samengevat uit de bronnen die bij elk bericht staan. {UUR_ACTIEF.actief ? "Elk kwartier bijgewerkt (06:00–23:00)" : "Elke dag om 08:00 en 12:00 bijgewerkt"}, met nieuws vanaf middernacht. nieuwsinkort.nl</p>
      <p><a href="/over">Over deze site</a></p>
    </footer>
  );
}


export function Front({ children }: { children: ReactNode }) {
  const [enter] = useState(() => !intro.done && !rustig());
  return <div className={`front ${enter ? "enter" : ""}`}>{children}</div>;
}


export function Frame({ children, top, feed }: { children: ReactNode; top: ReactNode; feed?: boolean }) {
  return (
    <div className={`app ${feed ? "app-feed" : ""}`}>
      <IconSprite />
      {debug && <div style={{ position: "fixed", right: 4, top: 4, zIndex: 2147483647, background: "black", color: "white", padding: 4, fontSize: 10 }}>Afgewezen berichten: {afwijzingen.aantal}</div>}
      <div className="shell">
        <a className="skip" href="#top" onClick={(e) => { e.preventDefault(); document.getElementById("top")?.focus(); }}>Naar de inhoud</a>
        {top}
        {children}
      </div>
    </div>
  );
}
