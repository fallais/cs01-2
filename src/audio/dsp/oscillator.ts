/** 2-sample polynomial band-limited step residual. `t` is phase 0..1, `dt` phase increment. */
export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export function blepSaw(phase: number, dt: number): number {
  return 2 * phase - 1 - polyBlep(phase, dt);
}

/** Band-limited pulse, DC removed. `width` is the high portion of the cycle. */
export function blepPulse(phase: number, dt: number, width: number): number {
  let down = phase - width;
  if (down < 0) down += 1;
  const naive = phase < width ? 1 : -1;
  return naive + polyBlep(phase, dt) - polyBlep(down, dt) - (2 * width - 1);
}

/** Symmetric triangle, -1..1, for LFOs (no band-limiting needed). */
export function triangle(phase: number): number {
  return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
}
