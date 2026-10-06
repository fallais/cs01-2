import { PARAMS, PARAM_BY_ID, clampValue, isParamId, type ParamId, type ParamValues } from './audio/params';

export interface Patch {
  name: string;
  values: Partial<ParamValues>;
}

const PATCH_IDS: readonly ParamId[] = PARAMS.filter((p) => p.patch).map((p) => p.id);

/**
 * Factory patches. Only the parameters that differ from the defaults are
 * listed; `fullPatch` fills in the rest.
 */
export const FACTORY_PATCHES: readonly Patch[] = [
  { name: 'Init', values: {} },
  {
    name: 'Bubbly bass',
    values: { feet: 1, wave: 2, cutoff: 170, resonance: 0.68, egDepth: 0.55, kbdTrack: 1, attack: 0.002, decay: 0.22, sustain: 0, release: 0.12 },
  },
  {
    name: 'Squelch lead',
    values: { feet: 2, wave: 1, cutoff: 380, resonance: 0.84, egDepth: 0.72, kbdTrack: 2, attack: 0.003, decay: 0.42, sustain: 0.32, release: 0.2, lfoSpeed: 5.6, lfoDest: 0 },
  },
  {
    name: 'PWM strings-ish',
    values: { feet: 2, wave: 4, pwmSpeed: 0.9, cutoff: 2600, resonance: 0.08, egDepth: 0.12, attack: 0.35, decay: 1.2, sustain: 0.85, release: 0.9, lfoSpeed: 5.2, lfoDest: 0, legatoRetrig: 0 },
  },
  {
    name: 'Breath flute',
    values: { feet: 3, wave: 0, cutoff: 1100, resonance: 0.1, egDepth: 0.05, kbdTrack: 2, attack: 0.02, decay: 0.3, sustain: 1, release: 0.12, breathVca: 1, breathVcf: 0.45, lfoSpeed: 5, lfoDest: 0 },
  },
  {
    name: 'Noise wind',
    values: { feet: 4, cutoff: 420, resonance: 0.9, egDepth: 0.25, kbdTrack: 2, attack: 0.9, decay: 2, sustain: 0.7, release: 2.4, lfoSpeed: 0.6, lfoDest: 1 },
  },
  {
    name: 'Glissando lead',
    values: { feet: 2, wave: 1, glissando: 45, cutoff: 1400, resonance: 0.35, egDepth: 0.35, attack: 0.005, decay: 0.5, sustain: 0.7, release: 0.25, lfoSpeed: 5.8 },
  },
  {
    name: 'Soft brass',
    values: { feet: 2, wave: 1, cutoff: 300, resonance: 0.22, egDepth: 0.62, attack: 0.07, decay: 0.6, sustain: 0.55, release: 0.22, breathVcf: 0.5 },
  },
  {
    name: 'Pocket speaker',
    values: { feet: 3, wave: 3, cutoff: 3200, resonance: 0.25, egDepth: 0.2, attack: 0.002, decay: 0.15, sustain: 0.5, release: 0.1, speaker: 1 },
  },
];

/** Patch values for every patch parameter, defaults filled in, all clamped. */
export function fullPatch(values: Partial<ParamValues>): Partial<ParamValues> {
  const out: Partial<ParamValues> = {};
  for (const id of PATCH_IDS) {
    const p = PARAM_BY_ID[id];
    out[id] = clampValue(p, values[id] ?? p.def);
  }
  return out;
}

/** Snapshot of the patch parameters from the live state. */
export function capturePatch(name: string, values: ParamValues): Patch {
  const out: Partial<ParamValues> = {};
  for (const id of PATCH_IDS) out[id] = values[id];
  return { name, values: out };
}

// ---------------------------------------------------------------------------
// JSON import / export

const FORMAT = 'exhale-01-patch';
const VERSION = 1;

export function patchToJson(patch: Patch): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, name: patch.name, params: patch.values }, null, 2);
}

/** Parse and validate a patch. Unknown or non-patch keys are dropped, values clamped. */
export function patchFromJson(text: string): Patch {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (!isRecord(data) || data.format !== FORMAT) throw new Error('Not an Exhale-01 patch file.');
  if (typeof data.version !== 'number' || data.version > VERSION) throw new Error('Patch was made by a newer version.');
  if (!isRecord(data.params)) throw new Error('Patch has no parameters.');
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 40) : 'Imported';
  return { name, values: sanitizeValues(data.params) };
}

function sanitizeValues(raw: Record<string, unknown>): Partial<ParamValues> {
  const out: Partial<ParamValues> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!isParamId(key) || !PARAM_BY_ID[key].patch || typeof v !== 'number') continue;
    out[key] = clampValue(PARAM_BY_ID[key], v);
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// User patches in localStorage

const STORAGE_KEY = 'exhale-01.user-patches';

export function loadUserPatches(): Patch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(isRecord).flatMap((p) =>
      typeof p.name === 'string' && isRecord(p.values) ? [{ name: p.name, values: sanitizeValues(p.values) }] : [],
    );
  } catch {
    return [];
  }
}

/** Returns false if storage is unavailable or full. */
export function saveUserPatches(list: readonly Patch[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
