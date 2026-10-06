import { Engine } from './audio/engine';
import { PARAM_BY_ID, clampValue, defaultValues, type ParamId, type ParamValues } from './audio/params';

export type ParamListener = (id: ParamId, value: number) => void;
export type NoteListener = (note: number, on: boolean) => void;

/**
 * Central state: current parameter values and held notes. Every input source
 * (panel, wheels, QWERTY, MIDI, presets) goes through here, and every view
 * subscribes to it, so the UI always mirrors what the engine is playing.
 */
export class Synth {
  readonly values: ParamValues = defaultValues();
  readonly engine = new Engine(this.values);
  /** Notes held per source, so a source can release only its own notes. */
  private readonly held = new Map<string, Set<number>>();
  private readonly paramListeners = new Set<ParamListener>();
  private readonly noteListeners = new Set<NoteListener>();

  set(id: ParamId, value: number): void {
    const v = clampValue(PARAM_BY_ID[id], value);
    if (this.values[id] === v) return;
    this.values[id] = v;
    this.engine.setParam(id, v);
    for (const l of this.paramListeners) l(id, v);
  }

  get(id: ParamId): number {
    return this.values[id];
  }

  /** Apply many values at once (presets). Unlisted parameters are untouched. */
  setMany(values: Partial<ParamValues>): void {
    for (const [id, v] of Object.entries(values) as Array<[ParamId, number]>) this.set(id, v);
  }

  noteOn(note: number, source: string): void {
    let set = this.held.get(source);
    if (!set) this.held.set(source, (set = new Set()));
    if (set.has(note)) return;
    set.add(note);
    this.engine.noteOn(note);
    if (!this.isHeldElsewhere(note, source)) for (const l of this.noteListeners) l(note, true);
  }

  noteOff(note: number, source: string): void {
    const set = this.held.get(source);
    if (!set?.delete(note)) return;
    if (!set.size) this.held.delete(source);
    if (this.isHeldElsewhere(note, source)) return;
    this.engine.noteOff(note);
    for (const l of this.noteListeners) l(note, false);
  }

  /** Release everything a source holds (e.g. on window blur), or all sources. */
  releaseAll(source?: string): void {
    const sources = source ? [source] : [...this.held.keys()];
    for (const s of sources) for (const n of [...(this.held.get(s) ?? [])]) this.noteOff(n, s);
    if (!source) this.engine.allNotesOff();
  }

  private isHeldElsewhere(note: number, source: string): boolean {
    for (const [s, set] of this.held) if (s !== source && set.has(note)) return true;
    return false;
  }

  onParam(l: ParamListener): () => void {
    this.paramListeners.add(l);
    return () => this.paramListeners.delete(l);
  }

  onNote(l: NoteListener): () => void {
    this.noteListeners.add(l);
    return () => this.noteListeners.delete(l);
  }
}
