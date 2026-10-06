/**
 * Stepped glissando: the pitch walks from the previous note to the new one in
 * whole semitone steps, one step every `stepSamples` samples.
 */
export class Glissando {
  /** Semitone currently sounding (null before the first note). */
  current: number | null = null;
  target = 0;
  private count = 0;

  /** Set a new destination. With `glide` false (or no previous note) it jumps. */
  setTarget(note: number, glide: boolean): void {
    this.target = note;
    if (this.current === null || !glide) this.current = note;
    this.count = 0;
  }

  /** Advance one sample. `stepSamples` <= 0 means glissando off (jump). */
  tick(stepSamples: number): number {
    if (this.current === null) return this.target;
    if (this.current !== this.target) {
      if (stepSamples <= 0) {
        this.current = this.target;
      } else if (++this.count >= stepSamples) {
        this.count = 0;
        this.current += this.target > this.current ? 1 : -1;
      }
    }
    return this.current;
  }
}

/** The semitones a glissando passes through, endpoints included. */
export function glissandoSequence(from: number, to: number): number[] {
  const dir = to >= from ? 1 : -1;
  const out: number[] = [];
  for (let n = from; n !== to; n += dir) out.push(n);
  out.push(to);
  return out;
}
