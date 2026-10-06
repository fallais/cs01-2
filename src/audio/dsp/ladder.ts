/** Cheap tanh: exact enough for saturation, clamps beyond ±3. */
export function softTanh(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/**
 * 4-pole (24 dB/oct) resonant low-pass ladder using zero-delay-feedback
 * one-pole stages. The feedback is solved linearly, then the ladder input is
 * pushed through a tanh, which tames the resonance peak and lets it ring
 * without blowing up near self-oscillation.
 */
export class Ladder {
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private s4 = 0;

  /**
   * @param x input sample
   * @param g prewarped cutoff, tan(pi * fc / fs)
   * @param k feedback amount, 0..~4 (4 = self-oscillation)
   * @param drive input gain into the saturator
   */
  process(x: number, g: number, k: number, drive: number): number {
    const G = g / (1 + g);
    const b = 1 / (1 + g);
    const G2 = G * G;
    const G4 = G2 * G2;
    const S = b * (G2 * G * this.s1 + G2 * this.s2 + G * this.s3 + this.s4);
    const y4est = (G4 * x + S) / (1 + k * G4);
    const u = softTanh((x - k * y4est) * drive) / drive;

    let v = (u - this.s1) * G;
    const y1 = v + this.s1;
    this.s1 = y1 + v;
    v = (y1 - this.s2) * G;
    const y2 = v + this.s2;
    this.s2 = y2 + v;
    v = (y2 - this.s3) * G;
    const y3 = v + this.s3;
    this.s3 = y3 + v;
    v = (y3 - this.s4) * G;
    const y4 = v + this.s4;
    this.s4 = y4 + v;
    return y4;
  }

  reset(): void {
    this.s1 = this.s2 = this.s3 = this.s4 = 0;
  }
}
