import {
  PARAMS,
  SECTIONS,
  formatValue,
  fromNormalized,
  toNormalized,
  type Param,
  type ParamId,
  type Section,
} from '../audio/params';
import type { Synth } from '../synth';
import { h, onDoubleActivate } from './dom';

const SLIDER_STEPS = 1000;

const SECTION_TITLES: Record<Section, string> = {
  VCO: 'VCO',
  LFO: 'LFO',
  VCF: 'VCF',
  EG: 'EG',
  Breath: 'Breath',
  Output: 'Output',
  Play: 'Play',
  Hidden: '',
};

const SECTION_NOTES: Partial<Record<Section, string>> = {
  LFO: 'Depth: mod wheel',
  VCF: '24 dB/oct',
  EG: 'Drives VCF + VCA',
};

type Updater = (value: number) => void;

/** Builds every section from the parameter table and keeps it in sync with the synth. */
export function buildPanel(root: HTMLElement, synth: Synth, extras: Partial<Record<Section, HTMLElement>>): void {
  const updaters = new Map<ParamId, Updater>();

  for (const section of SECTIONS) {
    const titleId = `sec-${section.toLowerCase()}`;
    const box = h('section', { class: `section section-${section.toLowerCase()}`, 'aria-labelledby': titleId });
    const head = h('header', { class: 'section-head' }, h('h2', { id: titleId }, SECTION_TITLES[section]));
    const note = SECTION_NOTES[section];
    if (note) head.append(h('span', { class: 'section-note' }, note));
    box.append(head);

    for (const p of PARAMS) {
      if (p.section !== section) continue;
      const [el, update] = p.curve === 'choice' ? choiceControl(p, synth) : sliderControl(p, synth);
      updaters.set(p.id, update);
      update(synth.get(p.id));
      box.append(el);
    }
    const extra = extras[section];
    if (extra) box.append(extra);
    root.append(box);
  }

  synth.onParam((id, v) => updaters.get(id)?.(v));
}

function sliderControl(p: Param, synth: Synth): [HTMLElement, Updater] {
  const id = `p-${p.id}`;
  const steps = p.step ? Math.round((p.max - p.min) / p.step) : SLIDER_STEPS;
  const input = h('input', { type: 'range', id, min: 0, max: steps, step: 1, class: 'slider' });
  const out = h('output', { for: id, class: 'value' });
  const label = h('label', { for: id }, p.label);
  const row = h('div', { class: 'ctl ctl-slider', title: 'Double-click to reset' }, label, input, out);

  const update: Updater = (v) => {
    const norm = toNormalized(p, v);
    input.value = String(Math.round(norm * steps));
    input.style.setProperty('--fill', `${norm * 100}%`);
    const text = formatValue(p, v);
    out.textContent = text;
    input.setAttribute('aria-valuetext', text);
  };
  const setFromPosition = (pos: number) => synth.set(p.id, fromNormalized(p, pos / steps));

  input.addEventListener('input', () => setFromPosition(input.valueAsNumber));
  onDoubleActivate(input, () => synth.set(p.id, p.def));

  // Finer keyboard steps than the browser default: arrows 1%, shift+arrows 0.1%, page 10%.
  input.addEventListener('keydown', (e) => {
    const big = Math.max(1, Math.round(steps / 10));
    const small = p.step ? 1 : e.shiftKey ? 1 : Math.round(steps / 100);
    const delta =
      e.key === 'ArrowUp' || e.key === 'ArrowRight' ? small
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -small
      : e.key === 'PageUp' ? big
      : e.key === 'PageDown' ? -big
      : 0;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      synth.set(p.id, p.def);
      return;
    }
    if (!delta) return;
    e.preventDefault();
    setFromPosition(Math.max(0, Math.min(steps, input.valueAsNumber + delta)));
  });
  return [row, update];
}

function choiceControl(p: Param, synth: Synth): [HTMLElement, Updater] {
  const name = `p-${p.id}`;
  const options = p.options ?? [];
  const legendId = `${name}-legend`;
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': legendId });
  const radios = options.map((label, i) => {
    const rid = `${name}-${i}`;
    const radio = h('input', { type: 'radio', name, id: rid, value: i });
    radio.addEventListener('change', () => {
      if (radio.checked) synth.set(p.id, i);
    });
    group.append(h('span', { class: 'seg' }, radio, h('label', { for: rid }, label)));
    return radio;
  });
  const wide = options.length > 3 ? ' ctl-choice-wide' : '';
  const row = h('div', { class: `ctl ctl-choice${wide}` }, h('span', { class: 'label', id: legendId }, p.label), group);
  const update: Updater = (v) => {
    const r = radios[Math.round(v)];
    if (r) r.checked = true;
  };
  return [row, update];
}
