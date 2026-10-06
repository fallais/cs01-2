import type { Synth } from '../synth';

const SOURCE = 'midi';

export type MidiStatus = { ok: true; inputs: string[] } | { ok: false; reason: string };

/**
 * Web MIDI input, omni: notes, pitch bend, CC1 mod wheel, CC2 breath,
 * CC120/123 all notes off. Fails gracefully when Web MIDI is missing or denied.
 */
export async function initMidi(synth: Synth, onStatus: (s: MidiStatus) => void): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    onStatus({ ok: false, reason: 'Web MIDI not supported in this browser' });
    return;
  }
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    onStatus({ ok: false, reason: 'MIDI access denied' });
    return;
  }

  const onMessage = (e: MIDIMessageEvent) => {
    const d = e.data;
    if (!d || d.length < 2) return;
    const status = d[0]! & 0xf0;
    const a = d[1]!;
    const b = d[2] ?? 0;
    switch (status) {
      case 0x90:
        if (b > 0) synth.noteOn(a, SOURCE);
        else synth.noteOff(a, SOURCE);
        break;
      case 0x80:
        synth.noteOff(a, SOURCE);
        break;
      case 0xe0: {
        const v = ((b << 7) | a) - 8192;
        synth.set('bend', v / (v < 0 ? 8192 : 8191));
        break;
      }
      case 0xb0:
        if (a === 1) synth.set('modWheel', b / 127);
        else if (a === 2) synth.set('breathCC', b / 127);
        else if (a === 120 || a === 123) synth.releaseAll(SOURCE);
        break;
    }
  };

  const refresh = () => {
    const names: string[] = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = onMessage;
      names.push(input.name ?? 'MIDI input');
    }
    onStatus({ ok: true, inputs: names });
  };
  access.onstatechange = refresh;
  refresh();
}
