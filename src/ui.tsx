import { Fragment } from "react";

// Focus-lezen (Bionic Reading) zoals in het design: eerste ~45% van elk woord vet.
export function BionicText({ text, on }: { text: string; on: boolean }) {
  if (!text) return null;
  if (!on) return <>{text}</>;
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        if (!part || /^\s+$/.test(part)) return <Fragment key={i}>{part}</Fragment>;
        const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)(.*)$/u.exec(part);
        if (!m || !/\p{L}/u.test(m[2])) return <Fragment key={i}>{part}</Fragment>;
        const core = m[2];
        const n = core.length <= 3 ? 1 : Math.ceil(core.length * 0.45);
        return (
          <Fragment key={i}>
            {m[1]}
            <b>{core.slice(0, n)}</b>
            {core.slice(n)}
            {m[3]}
          </Fragment>
        );
      })}
    </>
  );
}

export function host(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

export function FocusSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`focus ${value ? "on" : "off"}`}
      role="switch"
      aria-checked={value}
      aria-label="Focus-lezen"
      title="Focus-lezen: het begin van elk woord vet, zodat je sneller leest"
      onClick={() => onChange(!value)}
    >
      <span className="track">
        <span className="sthumb" />
      </span>
      <span className="focus-label">Focus-lezen</span>
    </button>
  );
}
