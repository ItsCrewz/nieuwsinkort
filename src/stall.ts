// Bewaakt de echte afspeeltijd; tijden van de klok zijn in milliseconden.
type Tik = {
  now: number; currentTime: number; paused: boolean; hidden: boolean; ended: boolean;
  seeking: boolean; herstelSeek: boolean; balkTijd: number; bufferVooruit: number; readyState?: number; networkState?: number;
};
type Besluit = "ok" | "balk-stop" | "balk-sync" | "nudge" | "herlaad";

export class Stall {
  private tijd: number | null = null;
  private sinds = 0;
  private gestopt = false;
  private nudgeOp: number | null = null;
  private vorigeReady: number | undefined;

  herstelNaar(tijd: number) { this.tijd = tijd; }

  tik(t: Tik): Besluit {
    const laadtVerder = t.networkState === 2 && this.vorigeReady !== undefined && (t.readyState ?? 0) > this.vorigeReady;
    this.vorigeReady = t.readyState;
    if (t.paused || t.hidden || t.ended || (t.seeking && !t.herstelSeek)) {
      this.tijd = null;
      this.gestopt = false;
      this.nudgeOp = null;
      return "ok";
    }
    if (this.tijd === null) {
      this.tijd = t.currentTime;
      this.sinds = t.now;
      return "ok";
    }
    if (!t.herstelSeek && Math.abs(t.currentTime - this.tijd) > 0.001) {
      this.tijd = t.currentTime;
      this.sinds = t.now;
      this.nudgeOp = null;
      if (this.gestopt || Math.abs(t.balkTijd - t.currentTime) > 0.3) {
        this.gestopt = false;
        return "balk-sync";
      }
      return "ok";
    }
    if (this.nudgeOp !== null && t.now - this.nudgeOp >= 3000) {
      if (laadtVerder) return "ok";
      this.nudgeOp = null;
      this.sinds = t.now;
      return "herlaad";
    }
    const dataKlaar = t.bufferVooruit >= 1 || (t.readyState ?? 0) >= 3;
    if (this.nudgeOp === null && t.now - this.sinds >= (dataKlaar ? 3000 : 10000)) {
      this.nudgeOp = t.now;
      return "nudge";
    }
    if (!this.gestopt && t.now - this.sinds >= 600) {
      this.gestopt = true;
      return "balk-stop";
    }
    return "ok";
  }
}
