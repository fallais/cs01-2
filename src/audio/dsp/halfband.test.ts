import { describe, expect, it } from 'vitest';
import { HalfbandDecimator } from './halfband';

const OS_RATE = 96_000;

function gainAt(freq: number): number {
  const d = new HalfbandDecimator();
  let peak = 0;
  for (let i = 0; i < 4000; i++) {
    const a = Math.sin((2 * Math.PI * freq * (2 * i)) / OS_RATE);
    const b = Math.sin((2 * Math.PI * freq * (2 * i + 1)) / OS_RATE);
    const y = d.process(a, b);
    if (i > 200) peak = Math.max(peak, Math.abs(y));
  }
  return peak;
}

describe('HalfbandDecimator', () => {
  it('has unity DC gain', () => {
    const d = new HalfbandDecimator();
    let y = 0;
    for (let i = 0; i < 100; i++) y = d.process(1, 1);
    expect(y).toBeCloseTo(1, 9);
  });

  it('passes the audio band flat', () => {
    for (const f of [100, 1000, 10_000, 18_000]) expect(gainAt(f)).toBeCloseTo(1, 1);
  });

  it('rejects what would alias back into the audio band', () => {
    for (const f of [30_000, 36_000, 44_000]) expect(20 * Math.log10(gainAt(f))).toBeLessThan(-60);
  });
});
