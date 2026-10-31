import { Icon } from "./icons";

export function LeegMelding({ aantal, onAanpassen, onReset }: { aantal: number; onAanpassen: () => void; onReset: () => void }) {
  return (
    <div className="empty">
      <Icon name="clock" />
      {aantal === 0 ? "Nog geen berichten in deze rubriek." : (
        <>
          Geen berichten met deze filters.
          <button type="button" className="linkbtn" onClick={onAanpassen}>Filters aanpassen</button>
          <button type="button" className="linkbtn" onClick={onReset}>Standaard</button>
        </>
      )}
    </div>
  );
}
