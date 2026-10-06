import type { Synth } from '../synth';

/**
 * Two-row computer keyboard mapping by physical key position (event.code), so
 * it works the same on QWERTY, AZERTY, QWERTZ...
 *
 *    W E   T Y U   O P          <- black keys
 *   A S D F G H J K L ; '       <- white keys, A = C
 *   Z / X = octave down / up
 */
export const QWERTY_MAP: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

const SOURCE = 'qwerty';
export const QWERTY_BASE_NOTE = 60;
const MIN_OCTAVE = -3;
const MAX_OCTAVE = 3;

function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['range', 'radio', 'checkbox', 'button'].includes(t.type);
}

export interface QwertyInput {
  octave: number;
  /** Physical key labels for the current keyboard layout, if the browser can tell. */
  labels: Map<string, string>;
}

export function initQwerty(synth: Synth, onOctave: (octave: number) => void): QwertyInput {
  const state: QwertyInput = { octave: 0, labels: new Map() };
  /** code -> note that key started, so a release after an octave change still matches. */
  const down = new Map<string, number>();

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      e.preventDefault();
      if (e.repeat) return;
      const next = state.octave + (e.code === 'KeyZ' ? -1 : 1);
      state.octave = Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, next));
      onOctave(state.octave);
      return;
    }
    const offset = QWERTY_MAP[e.code];
    if (offset === undefined) return;
    e.preventDefault();
    if (e.repeat || down.has(e.code)) return;
    const note = QWERTY_BASE_NOTE + state.octave * 12 + offset;
    down.set(e.code, note);
    synth.noteOn(note, SOURCE);
  });

  window.addEventListener('keyup', (e) => {
    const note = down.get(e.code);
    if (note === undefined) return;
    down.delete(e.code);
    synth.noteOff(note, SOURCE);
  });

  // Keys released while the window is unfocused never send keyup.
  const releaseAll = () => {
    down.clear();
    synth.releaseAll(SOURCE);
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });

  // Show the real key caps where supported (Chromium).
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
  kb?.getLayoutMap().then(
    (map) => {
      state.labels = map;
      onOctave(state.octave);
    },
    () => {},
  );
  return state;
}

/** Fallback key cap labels (US layout). */
export function defaultLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  return code === 'Semicolon' ? ';' : code === 'Quote' ? "'" : code;
}
