import type { MicBreath } from '../input/breath';
import type { Synth } from '../synth';
import { h } from './dom';

/** Mic toggle, live meters and a hint when the patch needs breath but none is coming in. */
export function buildBreathControls(synth: Synth, mic: MicBreath): HTMLElement {
  const btn = h('button', { type: 'button', class: 'mic-btn', 'aria-pressed': 'false' }, 'Enable mic');
  const micFill = h('span', { class: 'meter-fill' });
  const gateMark = h('span', { class: 'meter-mark', title: 'Gate threshold' });
  const breathFill = h('span', { class: 'meter-fill' });
  const micMeter = h('span', { class: 'meter', role: 'meter', 'aria-label': 'Mic level', 'aria-valuemin': 0, 'aria-valuemax': 100 }, micFill, gateMark);
  const breathMeter = h('span', { class: 'meter', role: 'meter', 'aria-label': 'Breath level', 'aria-valuemin': 0, 'aria-valuemax': 100 }, breathFill);
  const msg = h('p', { class: 'breath-msg', role: 'status', 'aria-live': 'polite' });

  const setButton = () => {
    btn.textContent = mic.enabled ? 'Mic on' : 'Enable mic';
    btn.setAttribute('aria-pressed', String(mic.enabled));
    btn.classList.toggle('on', mic.enabled);
  };

  btn.addEventListener('click', async () => {
    msg.textContent = '';
    if (mic.enabled) {
      mic.disable();
    } else {
      btn.disabled = true;
      btn.textContent = 'Opening…';
      try {
        await mic.enable();
        msg.textContent = 'Blow gently across the mic.';
      } catch (err) {
        msg.textContent = err instanceof Error ? err.message : String(err);
      }
      btn.disabled = false;
    }
    setButton();
    updateHint();
  });

  // Mic level on a dB scale (-60..0 dBFS) so the gate marker is readable.
  const dbPos = (amp: number) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(amp, 1e-6)) + 60) / 60));
  const placeGate = () => {
    gateMark.style.left = `${dbPos(synth.get('breathGate') * Math.SQRT2) * 100}%`;
  };
  placeGate();

  let lastCC = 0;
  synth.engine.onMeter((m) => {
    micFill.style.width = `${dbPos(m.mic) * 100}%`;
    breathFill.style.width = `${m.breath * 100}%`;
    micMeter.setAttribute('aria-valuenow', String(Math.round(dbPos(m.mic) * 100)));
    breathMeter.setAttribute('aria-valuenow', String(Math.round(m.breath * 100)));
  });

  const hint = h('p', { class: 'breath-hint', hidden: true });
  const updateHint = () => {
    const needs = synth.get('breathVca') > 0.5;
    const hasSource = mic.enabled || lastCC > 0;
    hint.hidden = !(needs && !hasSource);
    hint.textContent = 'This patch is breath controlled: enable the mic or send MIDI CC2.';
  };
  synth.onParam((id, v) => {
    if (id === 'breathGate') placeGate();
    if (id === 'breathCC') lastCC = Math.max(lastCC, v);
    if (id === 'breathVca' || id === 'breathCC') updateHint();
  });
  updateHint();

  return h(
    'div',
    { class: 'breath-extra' },
    h('div', { class: 'mic-row' }, btn),
    h('div', { class: 'meter-row' }, h('span', { class: 'label' }, 'Mic'), micMeter),
    h('div', { class: 'meter-row' }, h('span', { class: 'label' }, 'Breath'), breathMeter),
    hint,
    msg,
  );
}
