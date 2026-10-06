// Single source of truth for every synth parameter.
// Shared by the UI (slider ranges, labels, reset values), the preset system
// and the AudioWorklet (AudioParam descriptors).
//
// Values are stored in physical units (Hz, seconds, 0..1 amounts, choice
// indices). The `curve` decides how a 0..1 slider position maps to a value.

export type Curve = 'lin' | 'exp' | 'expZero' | 'choice';

export type Section = 'VCO' | 'LFO' | 'VCF' | 'EG' | 'Breath' | 'Output' | 'Play' | 'Hidden';

export interface ParamDef {
  readonly id: string;
  readonly label: string;
  readonly section: Section;
  readonly min: number;
  readonly max: number;
  readonly def: number;
  readonly curve: Curve;
  readonly unit?: string;
  /** Labels for 'choice' params; value is the index. */
  readonly options?: readonly string[];
  /** Round to this step after mapping (e.g. integer semitones). */
  readonly step?: number;
  /** Saved in patches (performance controllers are not). */
  readonly patch: boolean;
  /** Handled on the main thread rather than in the worklet. */
  readonly mainThread?: boolean;
}

const PARAM_TABLE = [
  // VCO
  { id: 'feet', label: 'Feet', section: 'VCO', min: 0, max: 4, def: 2, curve: 'choice', options: ["32'", "16'", "8'", "4'", 'Noise'], patch: true },
  { id: 'wave', label: 'Wave', section: 'VCO', min: 0, max: 4, def: 1, curve: 'choice', options: ['Sine', 'Saw', 'Square', 'Pulse', 'PWM'], patch: true },
  { id: 'pwmSpeed', label: 'PWM Speed', section: 'VCO', min: 0.1, max: 12, def: 1.2, curve: 'exp', unit: 'Hz', patch: true },
  { id: 'tune', label: 'Pitch', section: 'VCO', min: -1, max: 1, def: 0, curve: 'lin', unit: 'st', patch: true },
  { id: 'glissando', label: 'Glissando', section: 'VCO', min: 0, max: 250, def: 0, curve: 'expZero', unit: 'ms/st', patch: true },

  // LFO
  { id: 'lfoSpeed', label: 'Speed', section: 'LFO', min: 0.5, max: 10, def: 5, curve: 'exp', unit: 'Hz', patch: true },
  { id: 'lfoDest', label: 'Route', section: 'LFO', min: 0, max: 1, def: 0, curve: 'choice', options: ['VCO', 'VCF'], patch: true },

  // VCF
  { id: 'cutoff', label: 'Cutoff', section: 'VCF', min: 30, max: 16000, def: 1800, curve: 'exp', unit: 'Hz', patch: true },
  { id: 'resonance', label: 'Resonance', section: 'VCF', min: 0, max: 1, def: 0.2, curve: 'lin', patch: true },
  { id: 'egDepth', label: 'EG Depth', section: 'VCF', min: 0, max: 1, def: 0.4, curve: 'lin', patch: true },
  { id: 'kbdTrack', label: 'Key Track', section: 'VCF', min: 0, max: 2, def: 1, curve: 'choice', options: ['Off', 'Half', 'Full'], patch: true },

  // EG
  { id: 'attack', label: 'Attack', section: 'EG', min: 0.001, max: 5, def: 0.004, curve: 'exp', unit: 's', patch: true },
  { id: 'decay', label: 'Decay', section: 'EG', min: 0.005, max: 8, def: 0.35, curve: 'exp', unit: 's', patch: true },
  { id: 'sustain', label: 'Sustain', section: 'EG', min: 0, max: 1, def: 0.6, curve: 'lin', patch: true },
  { id: 'release', label: 'Release', section: 'EG', min: 0.005, max: 8, def: 0.18, curve: 'exp', unit: 's', patch: true },

  // Breath
  { id: 'breathVcf', label: 'VCF Depth', section: 'Breath', min: 0, max: 1, def: 0, curve: 'lin', patch: true },
  { id: 'breathVca', label: 'VCA Depth', section: 'Breath', min: 0, max: 1, def: 0, curve: 'lin', patch: true },
  { id: 'breathSens', label: 'Mic Sens', section: 'Breath', min: 1, max: 200, def: 15, curve: 'exp', unit: 'x', patch: false },
  { id: 'breathGate', label: 'Mic Gate', section: 'Breath', min: 0.0005, max: 0.1, def: 0.006, curve: 'exp', patch: false },

  // Output
  { id: 'volume', label: 'Volume', section: 'Output', min: 0, max: 1, def: 0.7, curve: 'lin', patch: false },
  { id: 'speaker', label: 'Tiny Speaker', section: 'Output', min: 0, max: 1, def: 0, curve: 'choice', options: ['Off', 'On'], patch: true, mainThread: true },
  { id: 'drift', label: 'Drift', section: 'Output', min: 0, max: 1, def: 1, curve: 'choice', options: ['Off', 'On'], patch: false },
  { id: 'detune', label: 'Note Detune', section: 'Output', min: 0, max: 1, def: 1, curve: 'choice', options: ['Off', 'On'], patch: false },
  { id: 'noiseFloor', label: 'Noise Floor', section: 'Output', min: 0, max: 1, def: 1, curve: 'choice', options: ['Off', 'On'], patch: false },

  // Playing settings
  { id: 'bendRange', label: 'Bend Range', section: 'Play', min: 1, max: 12, def: 2, curve: 'lin', step: 1, unit: 'st', patch: false },
  { id: 'legatoRetrig', label: 'Retrigger', section: 'Play', min: 0, max: 1, def: 0, curve: 'choice', options: ['Off', 'On'], patch: true },

  // Performance controllers (driven by wheels / MIDI, not shown as sliders)
  { id: 'bend', label: 'Pitch Bend', section: 'Hidden', min: -1, max: 1, def: 0, curve: 'lin', patch: false },
  { id: 'modWheel', label: 'Mod Wheel', section: 'Hidden', min: 0, max: 1, def: 0, curve: 'lin', patch: false },
  { id: 'breathCC', label: 'Breath CC', section: 'Hidden', min: 0, max: 1, def: 0, curve: 'lin', patch: false },
] as const satisfies readonly ParamDef[];

export type ParamId = (typeof PARAM_TABLE)[number]['id'];
export type ParamValues = Record<ParamId, number>;
export type Param = ParamDef & { readonly id: ParamId };

export const PARAMS: readonly Param[] = PARAM_TABLE;

export const PARAM_BY_ID: Record<ParamId, Param> = Object.fromEntries(
  PARAMS.map((p) => [p.id, p]),
) as Record<ParamId, Param>;

export const SECTIONS: readonly Section[] = ['VCO', 'LFO', 'VCF', 'EG', 'Breath', 'Output', 'Play'];

export function defaultValues(): ParamValues {
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.def])) as ParamValues;
}

export function isParamId(id: string): id is ParamId {
  return Object.hasOwn(PARAM_BY_ID, id);
}

// ---------------------------------------------------------------------------
// Curves: slider position (0..1) <-> value

/** Below this slider position an 'expZero' parameter reads as exactly 0. */
export const EXP_ZERO_THRESHOLD = 0.02;
/** Lowest non-zero value of an 'expZero' parameter, as a fraction of max. */
export const EXP_ZERO_FLOOR = 0.03;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampValue(p: ParamDef, v: number): number {
  if (!Number.isFinite(v)) return p.def;
  let out = clamp(v, p.min, p.max);
  if (p.curve === 'choice') out = Math.round(out);
  else if (p.step) out = Math.round(out / p.step) * p.step;
  return out;
}

export function fromNormalized(p: ParamDef, x: number): number {
  x = clamp(x, 0, 1);
  let v: number;
  switch (p.curve) {
    case 'lin':
      v = p.min + (p.max - p.min) * x;
      break;
    case 'exp':
      v = p.min * Math.pow(p.max / p.min, x);
      break;
    case 'expZero': {
      if (x < EXP_ZERO_THRESHOLD) return 0;
      const lo = p.max * EXP_ZERO_FLOOR;
      const t = (x - EXP_ZERO_THRESHOLD) / (1 - EXP_ZERO_THRESHOLD);
      v = lo * Math.pow(p.max / lo, t);
      break;
    }
    case 'choice':
      v = Math.round(p.min + (p.max - p.min) * x);
      break;
  }
  return clampValue(p, v);
}

export function toNormalized(p: ParamDef, v: number): number {
  v = clamp(v, p.min, p.max);
  switch (p.curve) {
    case 'lin':
    case 'choice':
      return p.max === p.min ? 0 : (v - p.min) / (p.max - p.min);
    case 'exp':
      return Math.log(v / p.min) / Math.log(p.max / p.min);
    case 'expZero': {
      const lo = p.max * EXP_ZERO_FLOOR;
      if (v < lo) return 0;
      const t = Math.log(v / lo) / Math.log(p.max / lo);
      return EXP_ZERO_THRESHOLD + t * (1 - EXP_ZERO_THRESHOLD);
    }
  }
}

export function formatValue(p: ParamDef, v: number): string {
  if (p.curve === 'choice' && p.options) return p.options[Math.round(v)] ?? String(v);
  if (p.id === 'glissando' && v === 0) return 'Off';
  const unit = p.unit ?? '';
  if (unit === 's') return v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
  if (unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${v < 10 ? v.toFixed(2) : Math.round(v)} Hz`;
  if (unit === 'st') return `${v > 0 ? '+' : ''}${v.toFixed(p.step ? 0 : 2)} st`;
  if (unit === 'ms/st') return `${Math.round(v)} ms/st`;
  if (unit === 'x') return `×${v < 10 ? v.toFixed(1) : Math.round(v)}`;
  if (p.id === 'breathGate') return v.toFixed(4);
  return `${Math.round(v * 100)}%`;
}

// ---------------------------------------------------------------------------
// Voicing constants. These are by-ear guesses, not measurements of the
// hardware. Tune them against recordings.

export const VOICE = {
  /** Semitone offset of each feet position (index matches 'feet' options). 8' plays the written pitch. */
  feetOffsets: [-24, -12, 0, 12, 0] as const,
  noiseFeetIndex: 4,
  /** Pulse width of the "narrow pulse" wave. */
  narrowPulseWidth: 0.18,
  /** PWM: width = 0.5 ± pwmDepth (triangle LFO). Fixed, like the hardware. */
  pwmDepth: 0.42,
  /** Full mod wheel vibrato depth, semitones peak. */
  lfoVibratoSemis: 0.9,
  /** Full mod wheel wah depth, octaves peak. */
  lfoWahOctaves: 2.2,
  /** EG depth = 1 sweeps the cutoff up this many octaves. */
  egVcfOctaves: 7,
  /** Breath VCF depth = 1 at full breath opens the cutoff this many octaves. */
  breathVcfOctaves: 6,
  /** Ladder feedback at resonance = 1 (4 = self-oscillation threshold). */
  resonanceMaxK: 3.96,
  /** Bass loss compensation applied with resonance. */
  resonanceGainComp: 0.45,
  /** Input drive into the ladder (tanh). */
  filterDrive: 1.6,
  /** Reference note for keyboard tracking (no offset at this note). */
  kbdTrackRefNote: 60,
  /** Peak of the slow random pitch drift, cents. */
  driftCents: 4,
  /** Random detune applied per note-on, ± cents. */
  noteDetuneCents: 3,
  /** Constant hiss level, dBFS. */
  noiseFloorDb: -78,
  /** Smoothing time constant for continuous parameters, seconds. */
  paramSmoothSec: 0.008,
  /** Crossfade time for wave / feet / noise switches, seconds. */
  switchFadeSec: 0.006,
  /** EG attack overshoot target (analog-style RC charge towards > 1). */
  attackTarget: 1.3,
  /** Envelope follower (mic breath). */
  followerRmsSec: 0.012,
  followerAttackSec: 0.015,
  followerReleaseSec: 0.14,
} as const;

export const KEYBOARD = {
  /** MIDI note of the lowest on-screen key (F). 32 keys, F..C. */
  lowNote: 53,
  keys: 32,
} as const;

export const SPEAKER = {
  lowHz: 300,
  highHz: 5000,
  /** Small cone resonance bump. */
  peakHz: 1400,
  peakDb: 5,
  drive: 2.2,
} as const;

/** Name of the worklet processor. */
export const PROCESSOR_NAME = 'exhale-voice';
