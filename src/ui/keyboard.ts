import { KEYBOARD } from '../audio/params';
import type { Synth } from '../synth';
import { h } from './dom';

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
/** Black key width relative to a white key. */
const BLACK_WIDTH = 0.62;

export function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

export interface KeyboardView {
  /** Re-label keys with their computer-keyboard shortcut (or nothing). */
  setLabels(labelFor: (note: number) => string | undefined): void;
}

/**
 * 32 mini keys, F to C. Mouse and multi-touch; sliding a finger across keys
 * plays legato (the new key is pressed before the old one is released).
 */
export function buildKeyboard(root: HTMLElement, synth: Synth): KeyboardView {
  const keys = new Map<number, HTMLElement>();
  const whiteCount = Array.from({ length: KEYBOARD.keys }, (_, i) => KEYBOARD.lowNote + i).filter(
    (n) => !BLACK.has(n % 12),
  ).length;
  const whiteW = 100 / whiteCount;

  const bed = h('div', {
    class: 'keys',
    role: 'group',
    'aria-label': 'Keyboard. Play with the mouse, touch, or the computer keys A to apostrophe.',
  });
  let whiteIndex = 0;
  for (let i = 0; i < KEYBOARD.keys; i++) {
    const note = KEYBOARD.lowNote + i;
    const black = BLACK.has(note % 12);
    const key = h('div', { class: black ? 'key black' : 'key white', 'data-note': note, 'aria-hidden': 'true' });
    key.append(h('span', { class: 'key-label' }));
    if (black) {
      const w = whiteW * BLACK_WIDTH;
      key.style.left = `${whiteIndex * whiteW - w / 2}%`;
      key.style.width = `${w}%`;
    } else {
      key.style.left = `${whiteIndex * whiteW}%`;
      key.style.width = `${whiteW}%`;
      whiteIndex++;
    }
    keys.set(note, key);
    bed.append(key);
  }
  root.append(bed);

  const active = new Map<number, number>(); // pointerId -> note
  const source = (pointerId: number) => `pointer-${pointerId}`;
  const noteAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.key');
    return el && bed.contains(el) ? Number(el.dataset.note) : null;
  };

  bed.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bed.setPointerCapture(e.pointerId);
    const note = noteAt(e.clientX, e.clientY);
    if (note === null) return;
    active.set(e.pointerId, note);
    synth.noteOn(note, source(e.pointerId));
  });
  bed.addEventListener('pointermove', (e) => {
    const prev = active.get(e.pointerId);
    if (prev === undefined) return;
    const note = noteAt(e.clientX, e.clientY);
    if (note === null || note === prev) return;
    active.set(e.pointerId, note);
    synth.noteOn(note, source(e.pointerId)); // legato: new note first
    synth.noteOff(prev, source(e.pointerId));
  });
  const end = (e: PointerEvent) => {
    const note = active.get(e.pointerId);
    if (note === undefined) return;
    active.delete(e.pointerId);
    synth.noteOff(note, source(e.pointerId));
  };
  bed.addEventListener('pointerup', end);
  bed.addEventListener('pointercancel', end);
  bed.addEventListener('lostpointercapture', end);
  bed.addEventListener('contextmenu', (e) => e.preventDefault());

  synth.onNote((note, on) => keys.get(note)?.classList.toggle('down', on));

  return {
    setLabels(labelFor) {
      for (const [note, key] of keys) {
        const label = key.firstElementChild as HTMLElement;
        label.textContent = labelFor(note) ?? '';
      }
    },
  };
}

/**
 * Pitch-bend (springs back to centre) and mod wheels as vertical sliders.
 * They follow the synth state too, so MIDI wheel moves show up here.
 */
export function buildWheels(root: HTMLElement, synth: Synth): void {
  root.append(
    wheel(synth, 'bend', 'Bend', -1, 1, true),
    wheel(synth, 'modWheel', 'Mod', 0, 1, false),
  );
}

const WHEEL_STEPS = 1000;

function wheel(synth: Synth, id: 'bend' | 'modWheel', label: string, min: number, max: number, spring: boolean): HTMLElement {
  const inputId = `wheel-${id}`;
  const input = h('input', {
    type: 'range',
    id: inputId,
    class: 'wheel',
    min: Math.round(min * WHEEL_STEPS),
    max: Math.round(max * WHEEL_STEPS),
    step: 1,
    'aria-orientation': 'vertical',
  });
  const show = (v: number) => {
    input.value = String(Math.round(v * WHEEL_STEPS));
    input.setAttribute('aria-valuetext', id === 'bend' ? `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`);
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
  };
  show(synth.get(id));
  input.addEventListener('input', () => synth.set(id, input.valueAsNumber / WHEEL_STEPS));
  synth.onParam((pid, v) => {
    if (pid === id) show(v);
  });

  if (spring) {
    let raf = 0;
    const springBack = () => {
      cancelAnimationFrame(raf);
      const step = () => {
        const v = synth.get(id) * 0.55;
        synth.set(id, Math.abs(v) < 0.004 ? 0 : v);
        if (synth.get(id) !== 0) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    input.addEventListener('pointerdown', () => cancelAnimationFrame(raf));
    for (const ev of ['pointerup', 'pointercancel', 'change', 'keyup', 'blur'] as const) {
      input.addEventListener(ev, springBack);
    }
  }
  return h('div', { class: `wheel-box wheel-${id}` }, input, h('label', { for: inputId }, label));
}
