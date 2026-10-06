/** Small fast PRNG (xorshift32). */
export class Rng {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  /** Uniform in [0, 1). */
  next(): number {
    let s = this.s;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s >>> 0;
    return this.s / 4294967296;
  }
  /** Uniform in [-1, 1). */
  bipolar(): number {
    return this.next() * 2 - 1;
  }
}

/**
 * Smooth random wander in -1..1 (cosine-interpolated value noise with
 * irregular segment lengths). Used for slow pitch drift.
 */
export class Wander {
  private from = 0;
  private to = 0;
  private pos = 1;
  private inc = 0;
  private readonly rng: Rng;
  private readonly sampleRate: number;
  private readonly minSec: number;
  private readonly maxSec: number;

  constructor(rng: Rng, sampleRate: number, minSec = 0.7, maxSec = 2.6) {
    this.rng = rng;
    this.sampleRate = sampleRate;
    this.minSec = minSec;
    this.maxSec = maxSec;
  }

  /** Advance by `samples` and return the current value. */
  advance(samples: number): number {
    this.pos += this.inc * samples;
    if (this.pos >= 1) {
      this.from = this.to;
      this.to = this.rng.bipolar();
      this.pos = 0;
      const sec = this.minSec + (this.maxSec - this.minSec) * this.rng.next();
      this.inc = 1 / (sec * this.sampleRate);
    }
    const t = 0.5 - 0.5 * Math.cos(Math.PI * this.pos);
    return this.from + (this.to - this.from) * t;
  }
}
