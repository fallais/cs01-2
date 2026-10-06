import { describe, expect, it } from 'vitest';
import { PARAMS, PARAM_BY_ID, clampValue, defaultValues, fromNormalized, toNormalized } from './params';

describe('parameter curves', () => {
  it('round-trips every parameter through its curve', () => {
    for (const p of PARAMS) {
      for (const x of [0, 0.1, 0.33, 0.5, 0.77, 1]) {
        const v = fromNormalized(p, x);
        expect(v).toBeGreaterThanOrEqual(p.min);
        expect(v).toBeLessThanOrEqual(p.max);
        expect(fromNormalized(p, toNormalized(p, v))).toBeCloseTo(v, 6);
      }
    }
  });

  it('exp curves are geometric', () => {
    const cutoff = PARAM_BY_ID.cutoff;
    expect(fromNormalized(cutoff, 0)).toBeCloseTo(cutoff.min, 6);
    expect(fromNormalized(cutoff, 1)).toBeCloseTo(cutoff.max, 6);
    expect(fromNormalized(cutoff, 0.5)).toBeCloseTo(Math.sqrt(cutoff.min * cutoff.max), 6);
  });

  it('expZero reads 0 at the bottom of the slider', () => {
    const g = PARAM_BY_ID.glissando;
    expect(fromNormalized(g, 0)).toBe(0);
    expect(fromNormalized(g, 0.01)).toBe(0);
    expect(fromNormalized(g, 0.03)).toBeGreaterThan(0);
    expect(fromNormalized(g, 1)).toBeCloseTo(g.max, 6);
    expect(toNormalized(g, 0)).toBe(0);
  });

  it('choices and stepped params snap to integers', () => {
    expect(fromNormalized(PARAM_BY_ID.wave, 0.6)).toBe(2);
    expect(fromNormalized(PARAM_BY_ID.bendRange, 0.5)).toBe(7);
    expect(clampValue(PARAM_BY_ID.feet, 9)).toBe(4);
    expect(clampValue(PARAM_BY_ID.cutoff, Number.NaN)).toBe(PARAM_BY_ID.cutoff.def);
  });

  it('defaults are inside their ranges', () => {
    const d = defaultValues();
    for (const p of PARAMS) {
      expect(d[p.id]).toBe(p.def);
      expect(clampValue(p, p.def)).toBe(p.def);
    }
  });
});
