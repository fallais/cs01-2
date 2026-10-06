import './style.css';
import { startOnGesture } from './audio/engine';
import { MicBreath } from './input/breath';
import { initMidi, type MidiStatus } from './input/midi';
import { QWERTY_BASE_NOTE, QWERTY_MAP, defaultLabel, initQwerty } from './input/qwerty';
import { Synth } from './synth';
import { buildBreathControls } from './ui/breath-ui';
import { h } from './ui/dom';
import { buildKeyboard, buildWheels } from './ui/keyboard';
import { buildPanel } from './ui/panel';
import { buildPresetBar } from './ui/presets-bar';

const app = document.querySelector<HTMLDivElement>('#app')!;
const synth = new Synth();
const mic = new MicBreath(synth);

// --- layout ------------------------------------------------------------------
const audioStatus = h('span', { class: 'chip', id: 'audio-status' }, 'Audio off');
const midiStatus = h('span', { class: 'chip', id: 'midi-status' }, 'MIDI …');
const octaveStatus = h('span', { class: 'chip', id: 'octave-status', title: 'Computer keyboard octave (Z / X)' });
const presetBar = h('div', { class: 'preset-bar' });
const header = h(
  'header',
  { class: 'top' },
  h('div', { class: 'brand' }, h('h1', {}, 'EXHALE', h('span', { class: 'brand-num' }, '·01')), h('span', { class: 'tagline' }, 'breath mono synth')),
  presetBar,
  h('div', { class: 'chips' }, audioStatus, midiStatus, octaveStatus),
);
const panel = h('main', { class: 'panel' });
const wheels = h('div', { class: 'wheels' });
const keybed = h('div', { class: 'keybed' });
const perf = h('div', { class: 'perf' }, wheels, keybed);
const overlay = h(
  'div',
  { class: 'start-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'start-btn' },
  h('button', { type: 'button', id: 'start-btn', class: 'start-btn' }, 'Click to start'),
  h('p', {}, 'Audio starts after a click or key press (browser rule).'),
);
app.append(header, panel, perf, overlay);

buildPresetBar(presetBar, synth);
buildPanel(panel, synth, { Breath: buildBreathControls(synth, mic) });
buildWheels(wheels, synth);
const keyboard = buildKeyboard(keybed, synth);

// --- inputs ------------------------------------------------------------------
/** Show the computer-key shortcut on each on-screen key for the current octave. */
const labelKeys = (octave: number, layout?: Map<string, string>) => {
  octaveStatus.textContent = `Oct ${octave >= 0 ? '+' : ''}${octave}`;
  const byNote = new Map<number, string>();
  for (const [code, offset] of Object.entries(QWERTY_MAP)) {
    byNote.set(QWERTY_BASE_NOTE + octave * 12 + offset, (layout?.get(code) ?? defaultLabel(code)).toUpperCase());
  }
  keyboard.setLabels((n) => byNote.get(n));
};
const qwerty = initQwerty(synth, (octave) => labelKeys(octave, qwerty.labels));
labelKeys(0);

const showMidi = (s: MidiStatus) => {
  midiStatus.textContent = s.ok ? (s.inputs.length ? `MIDI: ${s.inputs.join(', ')}` : 'MIDI: no device') : 'MIDI off';
  midiStatus.title = s.ok ? '' : s.reason;
  midiStatus.classList.toggle('ok', s.ok && s.inputs.length > 0);
};
void initMidi(synth, showMidi);

// --- audio start ---------------------------------------------------------------
const showAudio = (running: boolean) => {
  overlay.hidden = running;
  audioStatus.textContent = running ? `Audio ${synth.engine.context?.sampleRate ?? ''} Hz` : 'Audio off';
  audioStatus.classList.toggle('ok', running);
};
synth.engine.onStateChange(showAudio);
startOnGesture(
  synth.engine,
  () => showAudio(true),
  (err) => {
    console.error(err);
    overlay.querySelector('p')!.textContent = `Could not start audio: ${err instanceof Error ? err.message : String(err)}`;
  },
);
overlay.querySelector('button')!.focus();

if (import.meta.env.DEV) (window as unknown as { exhale: Synth }).exhale = synth;
