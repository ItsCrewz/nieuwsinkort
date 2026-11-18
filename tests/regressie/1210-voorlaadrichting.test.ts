import assert from "node:assert/strict";
import { onNewsScroll } from "../../src/beelden";

class Element {
  scrollTop = 0;
  classList: { contains: (naam: string) => boolean };
  constructor(klasse: string) { this.classList = { contains: (naam) => naam === klasse }; }
}
const g = globalThis as unknown as Record<string, unknown>;
g.HTMLElement = Element;
let gepland = 0;
g.cancelAnimationFrame = () => {};
g.requestAnimationFrame = () => ++gepland;
const lijst = new Element("nf");
const foto = new Element("bl-track");
const scroll = (el: Element, top: number) => {
  el.scrollTop = top;
  onNewsScroll({ target: el } as unknown as Event);
};

scroll(lijst, 0);
scroll(lijst, 400);
scroll(lijst, 200);
assert.equal(gepland, 1, "omhoog wijzigt de richting");
scroll(foto, 0);
scroll(foto, 100);
assert.equal(gepland, 1, "fotoswipe wijzigt de richting niet");
scroll(lijst, 600);
assert.equal(gepland, 2, "omlaag wijzigt de richting weer");
console.log("1210 voorlaadrichting: oké");
