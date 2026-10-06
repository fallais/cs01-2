# Exhale-01

A browser monophonic synth with breath control, modelled on the documented architecture of a well-known 1984 mini monosynth (the CS01 II). It is an emulation by ear and by spec sheet, not a circuit model.

**Live:** https://fallais.github.io/cs01-2/

Built with Vite, strict TypeScript and the plain Web Audio API. There is no UI framework and no audio library. All of the voice DSP runs sample-by-sample in a single `AudioWorkletProcessor`.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: DSP logic + offline render of the worklet
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Audio starts after the first click or key press ("Click to start"). Microphone and MIDI need a secure context (`https://` or `localhost`).

## Signal flow

```
keys / MIDI ─▶ note stack (last-note priority) ─▶ glissando (semitone steps) ─▶ pitch
pitch + bend + LFO vibrato + drift + per-note detune ─▶ VCO (sine/saw/square/pulse/PWM) or noise
VCO ─▶ 24 dB/oct ladder (cutoff + EG depth + key track + LFO wah + breath VCF) ─▶ VCA (EG × breath)
mic ─▶ envelope follower ─┐
MIDI CC2 ─────────────────┴─▶ breath = max(mic, CC2)
VCA ─▶ dry ─────────────────────────────────────────────────▶ out
    └▶ tiny speaker (HP 300 Hz, LP 5 kHz, bump, soft clip) ─▶ out
```

Everything before "dry / tiny speaker" runs inside `voice.worklet.ts`, with the oscillator and filter at 2× the sample rate.

## Controls

| Section | Controls |
|---|---|
| **VCO** | Feet 32' / 16' / 8' / 4' / Noise · Wave sine / saw / square / narrow pulse / PWM · PWM Speed (its own triangle LFO, fixed depth) · Pitch ±1 semitone · Glissando (time per semitone step, bottom = off) |
| **LFO** | Speed 0.5–10 Hz, triangle · Route VCO (vibrato) or VCF (wah) · depth comes from the **mod wheel** |
| **VCF** | Cutoff · Resonance (up to the edge of self-oscillation) · EG Depth · Key Track off / half / full |
| **EG** | Attack, Decay, Sustain, Release. One envelope drives both the VCF and the VCA |
| **Breath** | VCF Depth · VCA Depth · Mic Sens · Mic Gate · **Enable mic** button with live mic and breath meters |
| **Output** | Volume · Tiny Speaker · Drift · Note Detune · Noise Floor |
| **Play** | Bend Range (1–12 st, default 2) · Retrigger (whether the EG restarts on legato notes, off by default) |

* **Double-click** (or double-tap) a slider to reset it. With a slider focused, **Delete** also resets it.
* Keyboard on a focused slider: arrows move 1%, Shift+arrows 0.1%, Page Up/Down 10%, Home/End jump to the ends.
* **Breath VCA depth at 100% with no breath is silent.** That is how the hardware behaves. Blow into the mic or send CC2.
* For the mic: click *Enable mic*, then blow across the mic, not straight into it. Raise *Mic Gate* until the yellow marker sits just above the room noise on the mic meter, then set *Mic Sens* so a steady blow fills the breath meter.

### Computer keyboard

Keys are matched by physical position, so the layout is the same on QWERTY, AZERTY and QWERTZ keyboards. The on-screen keys show the caps for your layout where the browser can tell.

```
  W E   T Y U   O P            ← sharps / flats
 A S D F G H J K L ; '         ← A = C4 … ' = F5
 Z = octave down, X = octave up (±3)
```

### On-screen keyboard

32 mini keys, F3 to C6. Click or touch to play. Slide across the keys for legato: with Retrigger off, the envelope keeps going and only the pitch (and glissando) moves. Multi-touch works, with last-note priority.

### MIDI

Any connected MIDI input, all channels: note on/off, pitch bend, CC1 (mod wheel → LFO depth), CC2 (breath controller), CC120/123 (all notes off). The status chip in the header shows the connected inputs. When Web MIDI is unavailable or denied, the chip shows "MIDI off" and the rest of the app works normally.

## Presets

Factory patches: *Init, Bubbly bass, Squelch lead, PWM strings-ish, Breath flute, Noise wind, Glissando lead, Soft brass, Pocket speaker*. *Breath flute* needs breath input.

*Save* stores the current patch under the typed name in `localStorage`. *Export* downloads it as JSON, and *Import* loads a JSON patch and keeps it as a user patch. Patches store sound parameters only. Volume, mic settings, bend range, drift, detune and noise floor are global.

## Project layout

```
src/audio/params.ts         one typed parameter table (+ voicing constants to tune by ear)
src/audio/voice.worklet.ts  the whole voice, sample-accurate
src/audio/dsp/*             pure DSP building blocks (unit tested)
src/audio/engine.ts         AudioContext, worklet loading, output chain, start-on-gesture
src/synth.ts                parameter state + held notes, shared by every input and view
src/input/                  qwerty.ts, midi.ts, breath.ts (mic)
src/ui/                     panel.ts, keyboard.ts (+ wheels), presets-bar.ts, breath-ui.ts
src/presets.ts              factory patches, localStorage, JSON import/export
```

The worklet is loaded with `import url from './voice.worklet.ts?worker&url'`. That works with `npm run dev` and in the production build, including when the build is served from a sub-path (the build uses `base: './'`).

## Known differences from the hardware

This is an approximation. None of it is measured against a real unit.

* **Filter:** a zero-delay-feedback 4-pole ladder with one tanh stage at its input. The real 24 dB filter's topology, resonance curve, bass loss and saturation character are not modelled at circuit level. Resonance stops just short of self-oscillation by design (`VOICE.resonanceMaxK`).
* **Ranges and curves:** cutoff range, EG times, LFO range, PWM depth, narrow-pulse width, vibrato/wah depths and breath depths are educated guesses. All of them live in `VOICE` / `PARAMS` in `src/audio/params.ts` so they can be tuned against recordings.
* **Glissando:** steps in semitones as on the hardware, but its timing law (fixed time per step, set by the slider) is a guess. It always glides from the last played note, even after a release.
* **Envelope:** one exponential ADSR. Analog curve shapes, how retriggering behaves on the original, and EG/VCA interaction are simplified. Legato retrigger is a setting here.
* **Breath:** the real instrument uses a dedicated breath controller. The mic path is an envelope follower (RMS + gate + attack/release), so it reacts to any loud sound, not just air pressure. Breath VCF opens the filter upward from the cutoff setting.
* **Keyboard:** no velocity (the original has none either). Notes are mapped F3–C6 at 8'. The absolute octave of the original keyboard is not verified.
* **Tiny speaker:** two biquad band-limits, a resonance bump and a tanh shaper. It is not a model of the actual speaker and cabinet.
* **Analog character:** drift is smooth random value noise, a few cents peak. Per-note detune is ±3 cents. The noise floor is white noise at about −78 dBFS. These are flavour, not measurements.
* Oscillator and filter run 2× oversampled with polyBLEP waveforms. At the very top of the range (4' top C ≈ 2 kHz) the worst alias is still around −47 dB below the fundamental.

## Tests

`npm test` runs:

* unit tests for the glissando step sequence, last-note priority, the breath envelope follower, the ADSR, parameter curves, presets and the half-band decimator;
* an offline render of the real worklet class, with the AudioWorklet globals mocked. It checks for NaNs and runaway levels, clicks on note and parameter changes, waveform crossfades, aliasing, breath gating, and CPU cost per 128-sample block.
