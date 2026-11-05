// Minimale nep-DOM voor rooktests van App en Feed: net genoeg voor react-dom/client, zonder DOM-bibliotheek.
const g = globalThis as any;
const noop = () => {};
export class Knoop {
  nodeType = 1;
  childNodes: Knoop[] = [];
  parentNode: Knoop | null = null;
  attrs = new Map<string, string>();
  style: Record<string, unknown> = { setProperty: noop, removeProperty: noop };
  ownerDocument: any;
  tekst = "";
  namespaceURI = "http://www.w3.org/1999/xhtml";
  classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
  dataset: Record<string, string> = {};
  [k: string]: any;
  constructor(public nodeName: string, nodeType = 1) {
    this.nodeType = nodeType;
    this.tagName = nodeName.toUpperCase();
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling() { const i = this.parentNode?.childNodes.indexOf(this) ?? -1; return i < 0 ? null : this.parentNode!.childNodes[i + 1] ?? null; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get textContent(): string { return this.nodeType === 3 ? this.tekst : this.childNodes.map((n) => n.textContent).join(""); }
  set textContent(v: string) { this.childNodes.forEach((n) => (n.parentNode = null)); this.childNodes = []; if (v) this.appendChild(g.document.createTextNode(v)); }
  get nodeValue() { return this.tekst; }
  set nodeValue(v: string) { this.tekst = v; }
  get data() { return this.tekst; }
  set data(v: string) { this.tekst = v; }
  appendChild(n: Knoop) { return this.insertBefore(n, null); }
  insertBefore(n: Knoop, voor: Knoop | null) {
    n.parentNode?.removeChild(n);
    const i = voor ? this.childNodes.indexOf(voor) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n: Knoop) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { this.parentNode?.removeChild(this); }
  contains(n: Knoop | null): boolean { return !!n && (n === this || this.childNodes.some((c) => c.contains(n))); }
  setAttribute(k: string, v: unknown) { this.attrs.set(k, String(v)); }
  setAttributeNS(_: unknown, k: string, v: unknown) { this.setAttribute(k, v); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  hasAttribute(k: string) { return this.attrs.has(k); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  removeAttributeNS(_: unknown, k: string) { this.attrs.delete(k); }
  addEventListener = noop;
  removeEventListener = noop;
  dispatchEvent = () => true;
  getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  focus = noop;
  blur = noop;
  scrollTo = noop;
  scrollIntoView = noop;
  buffered = { length: 0, start: () => 0, end: () => 0 };
  seekable = { length: 0, start: () => 0, end: () => 0 };
  currentTime = 0;
  duration = NaN;
  paused = true;
  muted = true;
  readyState = 0;
  load = noop;
  pause = noop;
  play = () => Promise.resolve();
  canPlayType = () => "";
  animate = () => ({ cancel: noop, finished: Promise.resolve(), onfinish: null });
  matches = () => false;
  closest = () => null;
  querySelector = (): Knoop | null => null;
  querySelectorAll = (): Knoop[] => [];
  getElementsByTagName = (): Knoop[] => [];
  /** Alle afstammelingen (diepte eerst) met dit attribuutpatroon. */
  vind(f: (n: Knoop) => boolean): Knoop[] {
    return this.childNodes.flatMap((n) => [...(f(n) ? [n] : []), ...n.vind(f)]);
  }
  get html(): string {
    if (this.nodeType === 3) return this.tekst;
    const a = [...this.attrs].map(([k, v]) => ` ${k}="${v}"`).join("");
    return `<${this.nodeName}${a}>${this.childNodes.map((n) => n.html).join("")}</${this.nodeName}>`;
  }
}

/** Zet window/document/fetch-stubs; geeft een container en de lijst met fetch-aanroepen terug. */
export function zetNepDom(antwoorden: Record<string, unknown>) {
  const winEv = new EventTarget();
  const doc: any = new Knoop("#document", 9);
  doc.createElement = (t: string) => { const n = new Knoop(t); n.ownerDocument = doc; return n; };
  doc.createElementNS = (ns: string, t: string) => { const n = doc.createElement(t); n.namespaceURI = ns; return n; };
  doc.createTextNode = (s: string) => { const n = new Knoop("#text", 3); n.tekst = s; n.ownerDocument = doc; return n; };
  doc.createComment = (s: string) => { const n = new Knoop("#comment", 8); n.tekst = s; n.ownerDocument = doc; return n; };
  doc.documentElement = doc.createElement("html");
  doc.body = doc.createElement("body");
  doc.head = doc.createElement("head");
  doc.visibilityState = "visible";
  doc.hidden = false;
  doc.activeElement = doc.body;
  doc.getElementById = () => null;
  doc.fonts = { ready: Promise.resolve() };
  doc.addEventListener = noop;
  doc.removeEventListener = noop;
  doc.ownerDocument = doc;
  const win: any = Object.assign(winEv, {
    document: doc,
    location: { hash: "", pathname: "/", search: "", href: "http://localhost/", origin: "http://localhost", replace: noop },
    history: { state: null, back: noop, pushState: noop, replaceState: noop },
    HTMLIFrameElement: class {},
    HTMLElement: Knoop,
    HTMLAnchorElement: class {},
    innerWidth: 390,
    innerHeight: 800,
    devicePixelRatio: 2,
    scrollTo: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    setTimeout: (f: () => void, ms?: number) => setTimeout(f, ms),
    clearTimeout,
    setInterval: (f: () => void, ms?: number) => { const t = setInterval(f, ms); t.unref?.(); return t; },
    clearInterval,
    requestAnimationFrame: (f: (t: number) => void) => setTimeout(() => f(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    requestIdleCallback: (f: () => void) => setTimeout(f, 0),
    cancelIdleCallback: clearTimeout,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    navigator: { userAgent: "node", maxTouchPoints: 0 },
    CSS: { escape: (s: string) => s },
  });
  win.addEventListener = winEv.addEventListener.bind(winEv);
  win.removeEventListener = winEv.removeEventListener.bind(winEv);
  win.dispatchEvent = winEv.dispatchEvent.bind(winEv);
  const opslag = new Map<string, string>();
  const storage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => void opslag.set(k, String(v)), removeItem: (k: string) => void opslag.delete(k) };
  win.localStorage = win.sessionStorage = storage;
  const nepNavigator = { userAgent: "node", maxTouchPoints: 0, onLine: true };
  for (const [k, v] of Object.entries({ window: win, document: doc, HTMLElement: Knoop, HTMLIFrameElement: win.HTMLIFrameElement, HTMLAnchorElement: win.HTMLAnchorElement, CSS: win.CSS, requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: clearTimeout, getComputedStyle: win.getComputedStyle, matchMedia: win.matchMedia })) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  for (const [k, v] of [["localStorage", storage], ["sessionStorage", storage], ["navigator", nepNavigator]] as const) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  class Waarnemer {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
    takeRecords = () => [];
  }
  for (const [k, v] of Object.entries({ IntersectionObserver: Waarnemer, ResizeObserver: Waarnemer, MutationObserver: Waarnemer, innerWidth: 390, innerHeight: 800 })) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // act() plant taken via MessageChannel; Node's echte ports houden het proces open
  g.MessageChannel = class {
    port1: { onmessage: ((e: { data: unknown }) => void) | null } = { onmessage: null };
    port2 = { postMessage: (data: unknown) => setImmediate(() => this.port1.onmessage?.({ data })) };
  };
  const calls: string[] = [];
  g.fetch = async (url: unknown) => {
    const u = String(url);
    calls.push(u);
    const pad = u.split("?")[0];
    if (!(pad in antwoorden)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => antwoorden[pad] };
  };
  const container: Knoop = doc.createElement("div");
  doc.body.appendChild(container);
  return { container, calls, doc };
}
