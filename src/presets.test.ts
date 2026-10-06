import { describe, expect, it } from 'vitest';
import { PARAM_BY_ID } from './audio/params';
import { FACTORY_PATCHES, fullPatch, patchFromJson, patchToJson } from './presets';

describe('presets', () => {
  it('factory patches only use valid, in-range patch parameters', () => {
    for (const p of FACTORY_PATCHES) {
      for (const [id, v] of Object.entries(p.values)) {
        const def = PARAM_BY_ID[id as keyof typeof PARAM_BY_ID];
        expect(def, `${p.name}.${id}`).toBeDefined();
        expect(def.patch, `${p.name}.${id}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(def.min);
        expect(v).toBeLessThanOrEqual(def.max);
      }
    }
  });

  it('round-trips through JSON', () => {
    const patch = { name: 'Test', values: fullPatch({ cutoff: 500, wave: 3 }) };
    expect(patchFromJson(patchToJson(patch))).toEqual(patch);
  });

  it('drops unknown keys, ignores non-patch params and clamps values', () => {
    const json = JSON.stringify({
      format: 'exhale-01-patch',
      version: 1,
      name: 'x',
      params: { cutoff: 1e9, bogus: 3, volume: 1, wave: '2', resonance: -4 },
    });
    expect(patchFromJson(json).values).toEqual({ cutoff: PARAM_BY_ID.cutoff.max, resonance: 0 });
  });

  it('rejects files that are not patches', () => {
    expect(() => patchFromJson('{oops')).toThrow(/JSON/);
    expect(() => patchFromJson('{"format":"other"}')).toThrow(/patch file/);
  });
});
