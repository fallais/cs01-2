// The whole monophonic voice: oscillator, PWM, noise, glissando, LFO, ladder
// filter, EG, VCA, breath follower and analog character. Runs on the audio
// thread so everything is sample-accurate.

import { Adsr } from './dsp/envelope';
import { EnvelopeFollower } from './dsp/follower';
import { Glissando } from './dsp/glissando';
import { HalfbandDecimator } from './dsp/halfband';
import { Ladder, softTanh } from './dsp/ladder';
import { NoteStack } from './dsp/notestack';
import { blepPulse, blepSaw, triangle } from './dsp/oscillator';
import { Rng, Wander } from './dsp/random';
import type { FromWorklet, ToWorklet } from './messages';
import { PARAMS, PROCESSOR_NAME, VOICE, type ParamId } from './params';

interface WorkletScope {
  sampleRate: number;
  AudioWorkletProcessor: new () => { readonly port: MessagePort };
  registerProcessor(name: string, ctor: unknown): void;
}
const scope = globalThis as unknown as WorkletScope;

type Params = Record<ParamId, Float32Array>;

const WAVE_COUNT = 5;
const WAVE_SINE = 0;
const WAVE_SAW = 1;
const WAVE_SQUARE = 2;
const WAVE_PULSE = 3;
const WAVE_PWM = 4;
const TWO_PI = Math.PI * 2;
const METER_INTERVAL_SEC = 1 / 30;
/** Overall output scaling, leaves headroom for resonance peaks. */
const OUTPUT_GAIN = 0.5;
/** Output is linear below this level, then softly limited towards 1. */
const LIMIT_KNEE = 0.8;
const limitAbove = (x: number) => LIMIT_KNEE + (1 - LIMIT_KNEE) * softTanh((x - LIMIT_KNEE) / (1 - LIMIT_KNEE));
/** Oscillator + filter run at this multiple of the sample rate. */
const OVERSAMPLE = 2;

class VoiceProcessor extends scope.AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS.map((p) => ({
      name: p.id,
      defaultValue: p.def,
      minValue: p.min,
      maxValue: p.max,
      automationRate: 'k-rate',
    }));
  }

  private readonly sr = scope.sampleRate;
  private readonly rng = new Rng((Math.random() * 0xffffffff) >>> 0);
  private readonly stack = new NoteStack();
  private readonly gliss = new Glissando();
  private readonly env = new Adsr(this.sr, VOICE.attackTarget);
  private readonly filter = new Ladder();
  private readonly decimator = new HalfbandDecimator();
  private readonly follower = new EnvelopeFollower(
    this.sr,
    VOICE.followerRmsSec,
    VOICE.followerAttackSec,
    VOICE.followerReleaseSec,
  );
  private readonly drift = new Wander(this.rng, this.sr);

  // Oscillator / LFO phases
  private phase = 0;
  private pwmPhase = 0;
  private lfoPhase = 0;

  // Smoothed values (one-pole per sample)
  private readonly smoothCoef = 1 - Math.exp(-1 / (VOICE.paramSmoothSec * this.sr));
  private readonly switchCoef = 1 - Math.exp(-1 / (VOICE.switchFadeSec * this.sr));
  private sCutoffOct = Math.log2(1800);
  private sRes = 0;
  private sEgDepth = 0;
  private sTrack = 0.5;
  private sTune = 0;
  private sBend = 0;
  private sMod = 0;
  private sBreathCC = 0;
  private sBreathVcf = 0;
  private sBreathVca = 0;
  private sVolume = 0;
  private sVibAmt = 1;
  private sNoiseAmt = 0;
  private readonly waveWeights = new Float32Array(WAVE_COUNT);

  private noteDetune = 0;
  private driftValue = 0;
  private dcX = 0;
  private dcY = 0;
  private meterCountdown = 0;
  private outPeak = 0;
  private micPeak = 0;
  private readonly envCache = new Float64Array(4).fill(-1);
  private primed = false;
  private glissOn = false;
  private retrig = false;
  private detuneOn = true;

  constructor() {
    super();
    this.waveWeights[WAVE_SAW] = 1;
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.onMessage(e.data);
  }

  private onMessage(m: ToWorklet): void {
    switch (m.type) {
      case 'noteOn': {
        const r = this.stack.press(m.note);
        this.newPitch(m.note);
        if (!r.legato || this.retrig || !this.env.gated) this.env.trigger();
        break;
      }
      case 'noteOff': {
        const r = this.stack.release(m.note);
        if (r.note === null) {
          if (r.changed) this.env.release();
        } else if (r.changed) {
          this.newPitch(r.note);
          if (this.retrig) this.env.trigger();
        }
        break;
      }
      case 'allNotesOff':
        this.stack.clear();
        this.env.release();
        break;
    }
  }

  private newPitch(note: number): void {
    this.gliss.setTarget(note, this.glissOn);
    this.noteDetune = this.detuneOn ? this.rng.bipolar() * VOICE.noteDetuneCents * 0.01 : 0;
  }

  /** One oscillator (or noise) sample at the oversampled rate. */
  private oscSample(dt: number, pwmWidth: number): number {
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    const ph = this.phase;
    const ww = this.waveWeights;
    let osc = 0;
    if (this.sNoiseAmt < 0.9999) {
      if (ww[WAVE_SINE]! > 1e-4) osc += ww[WAVE_SINE]! * Math.sin(TWO_PI * ph);
      if (ww[WAVE_SAW]! > 1e-4) osc += ww[WAVE_SAW]! * blepSaw(ph, dt);
      if (ww[WAVE_SQUARE]! > 1e-4) osc += ww[WAVE_SQUARE]! * blepPulse(ph, dt, 0.5);
      if (ww[WAVE_PULSE]! > 1e-4) osc += ww[WAVE_PULSE]! * blepPulse(ph, dt, VOICE.narrowPulseWidth) * 1.3;
      if (ww[WAVE_PWM]! > 1e-4) osc += ww[WAVE_PWM]! * blepPulse(ph, dt, pwmWidth);
    }
    if (this.sNoiseAmt > 1e-4) osc += (this.rng.bipolar() - osc) * this.sNoiseAmt;
    return osc;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Params): boolean {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const mic = inputs[0]?.[0];
    const n = out.length;
    const sr = this.sr;
    const P = (id: ParamId) => parameters[id][0]!;

    // --- block-rate parameter handling -----------------------------------
    const feet = Math.round(P('feet'));
    const wave = Math.round(P('wave'));
    const feetOffset = VOICE.feetOffsets[feet] ?? 0;
    const noiseTarget = feet === VOICE.noiseFeetIndex ? 1 : 0;
    const glissMs = P('glissando');
    const glissStep = glissMs > 0 ? (glissMs * 0.001 * sr) | 0 : 0;
    this.glissOn = glissMs > 0;
    this.retrig = P('legatoRetrig') >= 0.5;
    this.detuneOn = P('detune') >= 0.5;
    const pwmInc = P('pwmSpeed') / sr;
    const lfoInc = P('lfoSpeed') / sr;
    const vibTarget = P('lfoDest') < 0.5 ? 1 : 0;
    const bendRange = P('bendRange');
    const noiseFloor = P('noiseFloor') >= 0.5 ? Math.pow(10, VOICE.noiseFloorDb / 20) : 0;

    const a = P('attack');
    const d = P('decay');
    const s = P('sustain');
    const r = P('release');
    const ec = this.envCache;
    if (a !== ec[0] || d !== ec[1] || s !== ec[2] || r !== ec[3]) {
      ec[0] = a;
      ec[1] = d;
      ec[2] = s;
      ec[3] = r;
      this.env.set(a, d, s, r);
    }

    this.follower.sensitivity = P('breathSens');
    this.follower.threshold = P('breathGate');

    if (P('drift') >= 0.5) {
      this.driftValue = this.drift.advance(n) * VOICE.driftCents * 0.01;
    } else {
      this.drift.advance(n);
      this.driftValue = 0;
    }

    const tCutoffOct = Math.log2(P('cutoff'));
    const tRes = P('resonance');
    const tEg = P('egDepth');
    const tTrack = P('kbdTrack') * 0.5;
    const tTune = P('tune');
    const tBend = P('bend') * bendRange;
    const tMod = P('modWheel');
    const tBreathCC = P('breathCC');
    const tBreathVcf = P('breathVcf');
    const tBreathVca = P('breathVca');
    const vol = P('volume');
    const tVolume = vol * vol * OUTPUT_GAIN;

    if (!this.primed) {
      // First block: start every smoothed value at its target, no fade-in.
      this.primed = true;
      this.sCutoffOct = tCutoffOct;
      this.sRes = tRes;
      this.sEgDepth = tEg;
      this.sTrack = tTrack;
      this.sTune = tTune;
      this.sBend = tBend;
      this.sMod = tMod;
      this.sBreathCC = tBreathCC;
      this.sBreathVcf = tBreathVcf;
      this.sBreathVca = tBreathVca;
      this.sVolume = tVolume;
      this.sVibAmt = vibTarget;
      this.sNoiseAmt = noiseTarget;
      this.waveWeights.fill(0);
      this.waveWeights[wave] = 1;
    }

    const sc = this.smoothCoef;
    const wc = this.switchCoef;
    const ww = this.waveWeights;
    const osRate = sr * OVERSAMPLE;
    const cutoffLimit = Math.min(20_000, 0.45 * sr);
    const piOverOsRate = Math.PI / osRate;

    // --- per-sample loop --------------------------------------------------
    let breathNow = 0;
    for (let i = 0; i < n; i++) {
      this.sCutoffOct += (tCutoffOct - this.sCutoffOct) * sc;
      this.sRes += (tRes - this.sRes) * sc;
      this.sEgDepth += (tEg - this.sEgDepth) * sc;
      this.sTrack += (tTrack - this.sTrack) * sc;
      this.sTune += (tTune - this.sTune) * sc;
      this.sBend += (tBend - this.sBend) * sc;
      this.sMod += (tMod - this.sMod) * sc;
      this.sBreathCC += (tBreathCC - this.sBreathCC) * sc;
      this.sBreathVcf += (tBreathVcf - this.sBreathVcf) * sc;
      this.sBreathVca += (tBreathVca - this.sBreathVca) * sc;
      this.sVolume += (tVolume - this.sVolume) * sc;
      this.sVibAmt += (vibTarget - this.sVibAmt) * wc;
      this.sNoiseAmt += (noiseTarget - this.sNoiseAmt) * wc;
      for (let w = 0; w < WAVE_COUNT; w++) ww[w]! += ((w === wave ? 1 : 0) - ww[w]!) * wc;

      // Breath: max of mic follower and MIDI CC2
      const micIn = mic ? mic[i]! : 0;
      const micLevel = this.follower.process(micIn);
      const breath = micLevel > this.sBreathCC ? micLevel : this.sBreathCC;

      // LFOs
      this.lfoPhase += lfoInc;
      if (this.lfoPhase >= 1) this.lfoPhase -= 1;
      const lfo = triangle(this.lfoPhase) * this.sMod;
      this.pwmPhase += pwmInc;
      if (this.pwmPhase >= 1) this.pwmPhase -= 1;

      // Pitch
      const note = this.gliss.tick(glissStep);
      const semis =
        note +
        feetOffset +
        this.sTune +
        this.sBend +
        lfo * this.sVibAmt * VOICE.lfoVibratoSemis +
        this.driftValue +
        this.noteDetune;
      const freq = 440 * Math.pow(2, (semis - 69) / 12);
      let dt = freq / osRate;
      if (dt > 0.45) dt = 0.45;
      const pwmWidth = 0.5 + VOICE.pwmDepth * triangle(this.pwmPhase);

      // Envelope
      const env = this.env.next();

      // Filter cutoff
      const cutoffOct =
        this.sCutoffOct +
        this.sEgDepth * env * VOICE.egVcfOctaves +
        (this.sTrack * (note - VOICE.kbdTrackRefNote)) / 12 +
        lfo * (1 - this.sVibAmt) * VOICE.lfoWahOctaves +
        this.sBreathVcf * breath * VOICE.breathVcfOctaves;
      let fc = Math.pow(2, cutoffOct);
      if (fc > cutoffLimit) fc = cutoffLimit;
      else if (fc < 15) fc = 15;
      const g = Math.tan(fc * piOverOsRate);
      const k = this.sRes * VOICE.resonanceMaxK;

      // Oscillator + ladder at 2x, then decimate
      const a0 = this.filter.process(this.oscSample(dt, pwmWidth) + 1e-18, g, k, VOICE.filterDrive);
      const a1 = this.filter.process(this.oscSample(dt, pwmWidth) + 1e-18, g, k, VOICE.filterDrive);
      const filtered = this.decimator.process(a0, a1) * (1 + this.sRes * VOICE.resonanceGainComp);

      // VCA: EG times breath (breath VCA depth 1 + no breath = silence)
      const breathGain = 1 - this.sBreathVca + this.sBreathVca * breath;
      let y = filtered * env * breathGain * this.sVolume;
      if (noiseFloor) y += this.rng.bipolar() * noiseFloor * this.sVolume;

      // DC blocker + gentle output limiter
      const hp = y - this.dcX + 0.9995 * this.dcY;
      this.dcX = y;
      this.dcY = hp;
      y = hp > LIMIT_KNEE ? limitAbove(hp) : hp < -LIMIT_KNEE ? -limitAbove(-hp) : hp;
      out[i] = y;

      const ay = y < 0 ? -y : y;
      if (ay > this.outPeak) this.outPeak = ay;
      const am = micIn < 0 ? -micIn : micIn;
      if (am > this.micPeak) this.micPeak = am;
      breathNow = breath;
    }

    // --- meter ------------------------------------------------------------
    this.meterCountdown -= n;
    if (this.meterCountdown <= 0) {
      this.meterCountdown = METER_INTERVAL_SEC * sr;
      const msg: FromWorklet = { type: 'meter', breath: breathNow, mic: this.micPeak, output: this.outPeak };
      this.port.postMessage(msg);
      this.outPeak = 0;
      this.micPeak = 0;
    }
    return true;
  }
}

scope.registerProcessor(PROCESSOR_NAME, VoiceProcessor);
