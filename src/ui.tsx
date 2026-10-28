import { Fragment, type ReactNode } from "react";

// Focus-lezen (Bionic Reading): eerste ~45% van elk woord vet.
// Uitkomst per tekst gecachet: bij tab-wissels en herladen hoeft React niet opnieuw te splitsen.
const bionicCache = new Map<string, ReactNode>();
function bionic(text: string): ReactNode {
  const hit = bionicCache.get(text);
  if (hit) return hit;
  const out = text.split(/(\s+)/).map((part, i) => {
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
  });
  if (bionicCache.size > 2000) bionicCache.clear();
  bionicCache.set(text, out);
  return out;
}
export function BionicText({ text, on }: { text: string; on: boolean }) {
  if (!text) return null;
  return <>{on ? bionic(text) : text}</>;
}

export function host(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

/** Schakelaar; alleen transform/opacity bewegen. checked="mixed" voor een groep die deels aan staat. */
export function Switch({ checked, onChange, label }: { checked: boolean | "mixed"; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked === "mixed" ? "mixed" : checked}
      aria-label={label}
      className={`sw ${checked === true ? "on" : checked === "mixed" ? "mixed" : ""}`}
      onClick={() => onChange(checked !== true)}
    >
      <span className="sw-k" />
    </button>
  );
}

export function FocusSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`focus ${value ? "on" : ""}`}
      role="switch"
      aria-checked={value}
      aria-label="Focus-lezen"
      title="Focus-lezen: het begin van elk woord vet, zodat je sneller leest"
      onClick={() => onChange(!value)}
    >
      <span className="focus-label">Focus-lezen</span>
      <span className="sw" aria-hidden="true">
        <span className="sw-k" />
      </span>
    </button>
  );
}
