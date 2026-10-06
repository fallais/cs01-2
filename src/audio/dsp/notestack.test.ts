import { describe, expect, it } from 'vitest';
import { NoteStack } from './notestack';

describe('NoteStack (last-note priority)', () => {
  it('plays the newest key', () => {
    const s = new NoteStack();
    expect(s.press(60)).toEqual({ note: 60, changed: true, legato: false });
    expect(s.press(64)).toEqual({ note: 64, changed: true, legato: true });
    expect(s.current).toBe(64);
  });

  it('returns to the previous held key on release (legato)', () => {
    const s = new NoteStack();
    s.press(60);
    s.press(64);
    s.press(67);
    expect(s.release(67)).toEqual({ note: 64, changed: true, legato: true });
    expect(s.release(64)).toEqual({ note: 60, changed: true, legato: true });
    expect(s.release(60)).toEqual({ note: null, changed: true, legato: false });
  });

  it('ignores the release of a key that is not sounding', () => {
    const s = new NoteStack();
    s.press(60);
    s.press(64);
    expect(s.release(60)).toEqual({ note: 64, changed: false, legato: false });
    expect(s.release(60)).toEqual({ note: 64, changed: false, legato: false });
    expect(s.release(64)).toEqual({ note: null, changed: true, legato: false });
  });

  it('re-pressing a held key moves it to the top', () => {
    const s = new NoteStack();
    s.press(60);
    s.press(64);
    s.press(60);
    expect(s.size).toBe(2);
    expect(s.release(60)).toEqual({ note: 64, changed: true, legato: true });
  });
});
