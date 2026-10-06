import { describe, expect, it } from 'vitest';
import { Glissando, glissandoSequence } from './glissando';

/** Run until the target is reached and record each distinct pitch with the sample it started on. */
function run(g: Glissando, step: number, maxSamples = 10_000): Array<[number, number]> {
  const seen: Array<[number, number]> = [];
  for (let i = 0; i < maxSamples; i++) {
    const n = g.tick(step);
    if (!seen.length || seen[seen.length - 1]![1] !== n) seen.push([i, n]);
    if (n === g.target && i > step) break;
  }
  return seen;
}

describe('glissandoSequence', () => {
  it('walks up and down in semitones, endpoints included', () => {
    expect(glissandoSequence(60, 64)).toEqual([60, 61, 62, 63, 64]);
    expect(glissandoSequence(64, 61)).toEqual([64, 63, 62, 61]);
    expect(glissandoSequence(60, 60)).toEqual([60]);
  });
});

describe('Glissando', () => {
  it('jumps straight to the first note', () => {
    const g = new Glissando();
    g.setTarget(60, true);
    expect(g.tick(100)).toBe(60);
  });

  it('steps one semitone every stepSamples', () => {
    const g = new Glissando();
    g.setTarget(60, true);
    g.setTarget(65, true);
    const seen = run(g, 10);
    expect(seen.map(([, n]) => n)).toEqual(glissandoSequence(60, 65));
    // Starts on the old note, then one step every 10 samples.
    expect(seen.map(([i]) => i)).toEqual([0, 9, 19, 29, 39, 49]);
  });

  it('glides downwards', () => {
    const g = new Glissando();
    g.setTarget(72, true);
    g.setTarget(69, true);
    expect(run(g, 5).map(([, n]) => n)).toEqual([72, 71, 70, 69]);
  });

  it('jumps when glide is off or the step is 0', () => {
    const g = new Glissando();
    g.setTarget(60, true);
    g.setTarget(67, false);
    expect(g.tick(10)).toBe(67);
    g.setTarget(55, true);
    expect(g.tick(0)).toBe(55);
  });

  it('retargets mid-glide from the current semitone', () => {
    const g = new Glissando();
    g.setTarget(60, true);
    g.setTarget(70, true);
    for (let i = 0; i < 30; i++) g.tick(10); // 3 steps -> 63
    expect(g.current).toBe(63);
    g.setTarget(61, true);
    expect(run(g, 10).map(([, n]) => n)).toEqual([63, 62, 61]);
  });
});
