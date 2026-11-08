import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; code: string };

export class Foutgrens extends Component<Props, { fout: boolean }> {
  state = { fout: false };

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
        <button type="button" className="linkbtn" onClick={() => this.setState({ fout: false })}>
          Opnieuw proberen
        </button>
      </div>
    );
    return this.props.children;
  }
}

export function registreerClientfouten(win: Window) {
  win.addEventListener("error", () => console.error("CLIENT_ONERROR"));
  win.addEventListener("unhandledrejection", () => console.error("CLIENT_UNHANDLED_REJECTION"));
}
