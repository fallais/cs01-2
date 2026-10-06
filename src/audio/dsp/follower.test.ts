import { describe, expect, it } from 'vitest';
import { EnvelopeFollower } from './follower';

const SR = 48_000;

function feed(f: EnvelopeFollower, amp: number, seconds: number): number {
  let level = 0;
  for (let i = 0; i < SR * seconds; i++) level = f.process(amp * Math.sin((2 * Math.PI * 200 * i) / SR));
  return level;
}

describe('EnvelopeFollower', () => {
  it('stays at 0 below the gate threshold', () => {
    const f = new EnvelopeFollower(SR);
    f.threshold = 0.01;
    expect(feed(f, 0.01, 0.5)).toBe(0); // RMS of a 0.01 sine is 0.007
  });

  it('rises with breath and saturates at 1', () => {
    const f = new EnvelopeFollower(SR);
    f.threshold = 0.005;
    f.sensitivity = 10;
    const soft = feed(f, 0.05, 0.5);
    expect(soft).toBeGreaterThan(0.25);
    expect(soft).toBeLessThan(0.35); // (0.0354 - 0.005) * 10 ≈ 0.30
    expect(feed(f, 0.8, 0.5)).toBeCloseTo(1, 3);
  });

  it('attacks faster than it releases', () => {
    const f = new EnvelopeFollower(SR, 0.005, 0.01, 0.2);
    f.sensitivity = 100;
    const up = feed(f, 0.5, 0.03);
    const atPeak = feed(f, 0.5, 0.5);
    const down = feed(f, 0, 0.03);
    expect(up).toBeGreaterThan(0.85);
    expect(atPeak - down).toBeLessThan(0.3);
    expect(feed(f, 0, 2)).toBeLessThan(1e-4);
  });
});
