/**
 * Breath envelope follower for a microphone signal: RMS detector, noise gate,
 * sensitivity gain, then separate attack/release smoothing. Output is 0..1.
 */
export class EnvelopeFollower {
  /** RMS below this reads as no breath. */
  threshold = 0.006;
  /** Gain applied to RMS above the threshold. */
  sensitivity = 15;
  level = 0;
  private meanSquare = 0;
  private readonly rmsCoef: number;
  private readonly attackCoef: number;
  private readonly releaseCoef: number;

  constructor(sampleRate: number, rmsSec = 0.012, attackSec = 0.015, releaseSec = 0.14) {
    const c = (sec: number) => 1 - Math.exp(-1 / Math.max(1, sec * sampleRate));
    this.rmsCoef = c(rmsSec);
    this.attackCoef = c(attackSec);
    this.releaseCoef = c(releaseSec);
  }

  process(x: number): number {
    this.meanSquare += (x * x - this.meanSquare) * this.rmsCoef;
    const rms = Math.sqrt(this.meanSquare);
    const target = rms <= this.threshold ? 0 : Math.min(1, (rms - this.threshold) * this.sensitivity);
    const coef = target > this.level ? this.attackCoef : this.releaseCoef;
    this.level += (target - this.level) * coef;
    return this.level;
  }
}
