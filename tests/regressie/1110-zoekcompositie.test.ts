import assert from "node:assert/strict";
import React, { createRef } from "react";
import { ZoekFormulier } from "../../src/zoekbalk";

// Japanse zoektekst blijft behouden wanneer Escape de IME-kandidaat annuleert.
const dispatcher = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
const vorige = dispatcher.current;
dispatcher.current = { useRef: (waarde: boolean) => ({ current: waarde }), useState: () => [false, () => {}] };
try {
  let query = "東京";
  let gesloten = 0;
  const formulier = ZoekFormulier({ query, onChange: (tekst) => { query = tekst; }, sluit: () => { gesloten++; query = ""; }, invoer: createRef<HTMLInputElement>() });
  const veld = formulier.props.children[0];
  const escape = (isComposing = false, keyCode = 0) => {
    let verhinderd = false;
    let gestopt = false;
    veld.props.onKeyDown({ key: "Escape", nativeEvent: { isComposing, keyCode }, preventDefault() { verhinderd = true; }, stopPropagation() { gestopt = true; } });
    return { verhinderd, gestopt };
  };
  veld.props.onCompositionStart();
  assert.deepEqual(escape(), { verhinderd: false, gestopt: true });
  assert.equal(query, "東京");
  assert.equal(gesloten, 0);
  veld.props.onCompositionEnd();
  assert.deepEqual(escape(true), { verhinderd: false, gestopt: true });
  assert.deepEqual(escape(false, 229), { verhinderd: false, gestopt: true });
  assert.equal(gesloten, 0);
  veld.props.onChange({ target: { value: "東京 nieuws" } });
  assert.equal(query, "東京 nieuws");
  assert.deepEqual(escape(), { verhinderd: true, gestopt: true });
  assert.equal(gesloten, 1);
  assert.equal(query, "");
} finally {
  dispatcher.current = vorige;
}
