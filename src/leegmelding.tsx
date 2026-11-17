import { Icon } from "./icons";

export function LeegMelding({ aantal, ruwAantal, onAanpassen, onReset, onBronnen, onBronnenReset }: { aantal: number; ruwAantal: number; onAanpassen: () => void; onReset: () => void; onBronnen: () => void; onBronnenReset: () => void }) {
  return (
    <div className="empty">
      <Icon name="clock" />
      {aantal === 0 && ruwAantal > 0 ? (
        <>
          Alle berichten in deze rubriek zijn verborgen door uitgeschakelde bronnen.
          <button type="button" className="linkbtn" onClick={onBronnen}>Bronnen aanpassen</button>
          <button type="button" className="linkbtn" onClick={onBronnenReset}>Alle bronnen inschakelen</button>
        </>
      ) : aantal === 0 ? "Nog geen berichten in deze rubriek." : (
        <>
          Geen berichten met deze filters.
          <button type="button" className="linkbtn" onClick={onAanpassen}>Filters aanpassen</button>
          <button type="button" className="linkbtn" onClick={onReset}>Standaard</button>
        </>
      )}
    </div>
  );
}
