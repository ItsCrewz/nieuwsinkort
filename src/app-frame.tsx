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

