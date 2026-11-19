import { Component, createElement, lazy, type ComponentType, type ReactNode } from "react";

type Props = { children: ReactNode; code: string; herstel?: () => void };

// React onthoudt een afgewezen lazy-import; een verse lazy probeert de chunk opnieuw.
export function lazyHerstel<C extends ComponentType<any>>(laad: () => Promise<{ default: C }>) {
  let L = lazy(laad);
  const Comp = ((props: object) => createElement(L as ComponentType<any>, props)) as unknown as C;
  return Object.assign(Comp, { herstel: () => { L = lazy(laad); } });
}

export class Foutgrens extends Component<Props, { fout: boolean; poging: number }> {
  state = { fout: false, poging: 0 };

  static getDerivedStateFromError() {
    return { fout: true };
  }

  componentDidCatch() {
    console.error(this.props.code);
  }

  render() {
    if (this.state.fout) return (
      <div className="empty" role="alert">
        Dit onderdeel kon niet worden weergegeven.
        <button type="button" className="linkbtn" onClick={() => { this.props.herstel?.(); this.setState((s) => ({ fout: false, poging: s.poging + 1 })); }}>
          Opnieuw proberen
        </button>
        {this.state.poging > 0 && this.props.herstel ? (
          // Alleen op klik, route en query blijven behouden: geen automatische herlaadlus.
          <button type="button" className="linkbtn" onClick={() => window.location.reload()}>
            Pagina herladen
          </button>
        ) : null}
      </div>
    );
    return this.props.children;
  }
}

export function registreerClientfouten(win: Window) {
  win.addEventListener("error", () => console.error("CLIENT_ONERROR"));
  win.addEventListener("unhandledrejection", () => console.error("CLIENT_UNHANDLED_REJECTION"));
}
