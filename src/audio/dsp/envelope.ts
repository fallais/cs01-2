const Stage = { Idle: 0, Attack: 1, Decay: 2, Release: 3 } as const;
type Stage = (typeof Stage)[keyof typeof Stage];

/** Number of time constants that make up a decay/release "time". */
const FALL_TCS = 3.5;

/**
 * ADSR with RC-style exponential segments. The attack charges towards an
 * overshoot target (> 1) and stops at 1, which gives the slightly convex
 * analog attack shape.
 */
export class Adsr {
  value = 0;
  private stage: Stage = Stage.Idle;
  private attackCoef = 0;
  private decayCoef = 0;
  private releaseCoef = 0;
  private sustain = 1;
  private readonly sampleRate: number;
  private readonly attackTarget: number;

  constructor(sampleRate: number, attackTarget = 1.3) {
    this.sampleRate = sampleRate;
    this.attackTarget = attackTarget;
    this.set(0.005, 0.3, 0.6, 0.2);
  }

  set(attack: number, decay: number, sustain: number, release: number): void {
    const sr = this.sampleRate;
    const at = this.attackTarget;
    // Time to charge 0 -> 1 towards `at` is tau * ln(at / (at - 1)).
    const attackTau = attack / Math.log(at / (at - 1));
    this.attackCoef = 1 - Math.exp(-1 / Math.max(1, attackTau * sr));
    this.decayCoef = 1 - Math.exp(-FALL_TCS / Math.max(1, decay * sr));
    this.releaseCoef = 1 - Math.exp(-FALL_TCS / Math.max(1, release * sr));
    this.sustain = sustain;
  }

  get active(): boolean {
    return this.stage !== Stage.Idle;
  }

  get gated(): boolean {
    return this.stage === Stage.Attack || this.stage === Stage.Decay;
  }

  /** Start (or restart) the attack from the current level, so no click. */
  trigger(): void {
    this.stage = Stage.Attack;
  }

  release(): void {
    if (this.stage !== Stage.Idle) this.stage = Stage.Release;
  }

  reset(): void {
    this.stage = Stage.Idle;
    this.value = 0;
  }

  next(): number {
    switch (this.stage) {
      case Stage.Attack:
        this.value += (this.attackTarget - this.value) * this.attackCoef;
        if (this.value >= 1) {
          this.value = 1;
          this.stage = Stage.Decay;
        }
        break;
      case Stage.Decay:
        // Also acts as the sustain stage: it keeps tracking the sustain level.
        this.value += (this.sustain - this.value) * this.decayCoef;
        break;
      case Stage.Release:
        this.value -= this.value * this.releaseCoef;
        if (this.value < 1e-5) {
          this.value = 0;
          this.stage = Stage.Idle;
        }
        break;
      case Stage.Idle:
        break;
    }
    return this.value;
  }
}
