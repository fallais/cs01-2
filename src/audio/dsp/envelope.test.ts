import { describe, expect, it } from 'vitest';
import { Adsr } from './envelope';

const SR = 48_000;

describe('Adsr', () => {
  it('reaches 1 in roughly the attack time, then decays to sustain', () => {
    const e = new Adsr(SR, 1.3);
    e.set(0.01, 0.1, 0.5, 0.1);
    e.trigger();
    let peakAt = -1;
    for (let i = 0; i < SR; i++) {
      if (e.next() >= 1 && peakAt < 0) peakAt = i;
    }
    expect(peakAt / SR).toBeGreaterThan(0.009);
    expect(peakAt / SR).toBeLessThan(0.011);
    expect(e.value).toBeCloseTo(0.5, 3);
  });

  it('releases to idle from wherever it is', () => {
    const e = new Adsr(SR);
    e.set(0.001, 0.05, 0.8, 0.05);
    e.trigger();
    for (let i = 0; i < SR * 0.2; i++) e.next();
    e.release();
    for (let i = 0; i < SR; i++) e.next();
    expect(e.value).toBe(0);
    expect(e.active).toBe(false);
  });

  it('retriggers from the current level without jumping', () => {
    const e = new Adsr(SR);
    e.set(0.05, 0.05, 0.3, 0.5);
    e.trigger();
    for (let i = 0; i < SR * 0.3; i++) e.next();
    e.release();
    for (let i = 0; i < SR * 0.05; i++) e.next();
    const before = e.value;
    e.trigger();
    expect(Math.abs(e.next() - before)).toBeLessThan(0.01);
  });
});
