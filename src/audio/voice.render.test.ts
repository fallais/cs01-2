// Renders the real worklet processor offline (with the AudioWorklet globals
// mocked) to catch NaNs, runaway levels, clicks, aliasing and CPU cost.
import { beforeAll, describe, expect, it } from 'vitest';
import type { ToWorklet } from './messages';
import { PARAMS, defaultValues, type ParamId, type ParamValues } from './params';

const SR = 48_000;
const BLOCK = 128;

interface Proc {
  port: { onmessage: ((e: { data: ToWorklet }) => void) | null; postMessage(m: unknown): void };
  process(i: Float32Array[][], o: Float32Array[][], p: Record<string, Float32Array>): boolean;
}
let Ctor: new () => Proc;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.sampleRate = SR;
  g.AudioWorkletProcessor = class {
    port = { onmessage: null, postMessage() {} };
  };
  g.registerProcessor = (_name: string, c: new () => Proc) => {
    Ctor = c;
  };
  await import('./voice.worklet');
});

class Rig {
  readonly proc = new Ctor();
  readonly values: ParamValues = defaultValues();
  constructor(overrides: Partial<ParamValues> = {}) {
    Object.assign(this.values, { drift: 0, detune: 0, noiseFloor: 0 }, overrides);
    this.render(BLOCK / SR); // let the processor see the parameters before any note
  }
  send(m: ToWorklet) {
    this.proc.port.onmessage!({ data: m });
  }
  render(seconds: number, mic?: (i: number) => number): Float32Array {
    const blocks = Math.ceil((seconds * SR) / BLOCK);
    const out = new Float32Array(blocks * BLOCK);
    const params: Record<string, Float32Array> = {};
    for (const p of PARAMS) params[p.id] = new Float32Array([this.values[p.id as ParamId]]);
    const micBuf = new Float32Array(BLOCK);
    for (let b = 0; b < blocks; b++) {
      const o = new Float32Array(BLOCK);
      if (mic) for (let i = 0; i < BLOCK; i++) micBuf[i] = mic(b * BLOCK + i);
      this.proc.process([mic ? [micBuf] : []], [[o]], params);
      out.set(o, b * BLOCK);
    }
    return out;
  }
}

const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
/** Largest sample-to-sample jump relative to signal: a click detector for smooth signals. */
const maxStep = (x: Float32Array) => {
  let m = 0;
  for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i]! - x[i - 1]!));
  return m;
};

/** Magnitude of a single DFT bin (Goertzel). */
function toneLevel(x: Float32Array, freq: number): number {
  const w = (2 * Math.PI * freq) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    // Hann window to keep leakage down
    const s0 = x[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1))) + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / x.length;
}

describe('voice worklet (offline render)', () => {
  it('is silent with no note and sounds with one', () => {
    const r = new Rig();
    expect(peak(r.render(0.1))).toBe(0);
    r.send({ type: 'noteOn', note: 60 });
    const x = r.render(0.3);
    expect(x.every(Number.isFinite)).toBe(true);
    expect(peak(x)).toBeGreaterThan(0.05);
    expect(peak(x)).toBeLessThan(1);
  });

  it('every wave and feet setting renders finite, bounded audio', () => {
    for (let wave = 0; wave <= 4; wave++) {
      for (let feet = 0; feet <= 4; feet++) {
        const r = new Rig({ wave, feet, cutoff: 16000, resonance: 1 });
        r.send({ type: 'noteOn', note: 84 });
        const x = r.render(0.2);
        expect(x.every(Number.isFinite), `wave ${wave} feet ${feet}`).toBe(true);
        expect(peak(x), `wave ${wave} feet ${feet}`).toBeLessThan(1);
        expect(peak(x), `wave ${wave} feet ${feet}`).toBeGreaterThan(0.01);
      }
    }
  });

  it('the oscillator is band-limited (little aliasing on a high saw)', () => {
    // Top key at 4' is C7, ~2093 Hz. Harmonics above Nyquist fold back to |k*f0 - SR|.
    const r = new Rig({ wave: 1, feet: 3, cutoff: 16000, egDepth: 0, resonance: 0, sustain: 1 });
    r.send({ type: 'noteOn', note: 84 });
    r.render(0.1);
    const x = r.render(0.5);
    const f0 = 440 * 2 ** ((96 - 69) / 12);
    const fundamental = toneLevel(x, f0);
    let worst = -Infinity;
    for (let k = Math.ceil(SR / 2 / f0); k * f0 < 2 * SR; k++) {
      const folded = Math.abs(((k * f0 + SR / 2) % SR) - SR / 2);
      if (folded < 200) continue;
      worst = Math.max(worst, 20 * Math.log10(toneLevel(x, folded) / fundamental));
    }
    // A naive saw puts its first alias at about -22 dB; polyBLEP at 1x reached -34 dB.
    expect(worst).toBeLessThan(-45);
  });

  it('resonance near maximum rings but stays bounded', () => {
    const r = new Rig({ wave: 0, resonance: 1, cutoff: 800, egDepth: 0, sustain: 1 });
    r.send({ type: 'noteOn', note: 48 });
    const x = r.render(1);
    expect(x.every(Number.isFinite)).toBe(true);
    expect(peak(x)).toBeLessThan(1);
  });

  it('note on / off and parameter jumps are click-free on a sine', () => {
    const r = new Rig({ wave: 0, attack: 0.005, release: 0.01, cutoff: 16000, egDepth: 0, sustain: 1 });
    r.send({ type: 'noteOn', note: 57 });
    const a = r.render(0.2);
    r.values.volume = 0.1; // big step
    r.values.tune = 1;
    const b = r.render(0.2);
    r.send({ type: 'noteOff', note: 57 });
    const c = r.render(0.1);
    // A 220 Hz sine at amplitude A moves at most 2*pi*220/SR*A per sample.
    const bound = ((2 * Math.PI * 233) / SR) * peak(a) * 1.6;
    expect(maxStep(a.subarray(BLOCK))).toBeLessThan(bound);
    expect(maxStep(b)).toBeLessThan(bound);
    expect(maxStep(c)).toBeLessThan(bound);
  });

  it('switching waveform while a note sounds does not click', () => {
    const r = new Rig({ wave: 0, cutoff: 300, resonance: 0, egDepth: 0, sustain: 1 });
    r.send({ type: 'noteOn', note: 45 });
    r.render(0.2);
    const before = maxStep(r.render(0.1));
    r.values.wave = 2;
    const after = maxStep(r.render(0.1));
    expect(after).toBeLessThan(before * 4 + 0.01);
  });

  it('breath VCA at max with no breath is silent; breath brings the note in', () => {
    const r = new Rig({ breathVca: 1 });
    r.send({ type: 'noteOn', note: 60 });
    expect(peak(r.render(0.3))).toBeLessThan(1e-3);
    r.values.breathCC = 1;
    expect(peak(r.render(0.3))).toBeGreaterThan(0.05);
  });

  it('a microphone signal drives breath through the follower', () => {
    const r = new Rig({ breathVca: 1, breathSens: 20, breathGate: 0.005 });
    r.send({ type: 'noteOn', note: 60 });
    let seed = 1;
    const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    const quiet = r.render(0.3, () => noise() * 0.002);
    const blown = r.render(0.3, () => noise() * 0.2);
    expect(rms(quiet)).toBeLessThan(1e-3);
    expect(rms(blown)).toBeGreaterThan(0.02);
  });

  it('renders a 128-sample block well inside the real-time budget', () => {
    const r = new Rig({ wave: 4, resonance: 0.8, glissando: 40, drift: 1, detune: 1, noiseFloor: 1 });
    r.send({ type: 'noteOn', note: 60 });
    r.render(1); // warm up the JIT
    const seconds = 5;
    const t0 = performance.now();
    r.render(seconds);
    const msPerBlock = (performance.now() - t0) / ((seconds * SR) / BLOCK);
    const budget = (BLOCK / SR) * 1000; // 2.67 ms
    expect(msPerBlock).toBeLessThan(budget * 0.25);
    console.log(`voice: ${msPerBlock.toFixed(4)} ms per block (${((100 * msPerBlock) / budget).toFixed(1)}% of budget)`);
  });
});
