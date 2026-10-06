import workletUrl from './voice.worklet.ts?worker&url';
import type { FromWorklet, ToWorklet } from './messages';
import { PARAMS, PARAM_BY_ID, PROCESSOR_NAME, SPEAKER, type ParamId, type ParamValues } from './params';

export type MeterListener = (m: FromWorklet) => void;

const SWITCH_TC = 0.015;

/**
 * Owns the AudioContext, the voice worklet and the output chain:
 *
 *   mic ─▶ voice worklet ─┬─▶ dry ───────────────────────────────▶ destination
 *                         └─▶ HP ▶ HP ▶ peak ▶ LP ▶ LP ▶ shaper ▶ wet ─┘
 *                              (tiny speaker imitation)
 */
export class Engine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private starting: Promise<void> | null = null;
  private readonly meterListeners = new Set<MeterListener>();
  private readonly stateListeners = new Set<(running: boolean) => void>();
  private readonly values: ParamValues;

  /** `values` is the live parameter state; it is read when the engine starts. */
  constructor(values: ParamValues) {
    this.values = values;
  }

  get running(): boolean {
    return this.ctx?.state === 'running' && this.node !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Create (first call) or resume the audio graph. Must be called from a user gesture. */
  start(): Promise<void> {
    if (this.ctx && this.node) {
      return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
    }
    this.starting ??= this.build().catch((err: unknown) => {
      this.starting = null;
      throw err;
    });
    return this.starting;
  }

  private async build(): Promise<void> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    ctx.onstatechange = () => {
      for (const l of this.stateListeners) l(this.running);
    };
    // Resume synchronously inside the gesture, before the async module load.
    const resumed = ctx.resume();
    await ctx.audioWorklet.addModule(workletUrl);

    const parameterData: Record<string, number> = {};
    for (const p of PARAMS) if (!p.mainThread) parameterData[p.id] = this.values[p.id];

    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      parameterData,
    });
    node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
      for (const l of this.meterListeners) l(e.data);
    };
    node.onprocessorerror = (e) => console.error('Voice processor error', e);

    const dry = new GainNode(ctx, { gain: 1 });
    const wet = new GainNode(ctx, { gain: 0 });
    const hp1 = new BiquadFilterNode(ctx, { type: 'highpass', frequency: SPEAKER.lowHz, Q: 0.707 });
    const hp2 = new BiquadFilterNode(ctx, { type: 'highpass', frequency: SPEAKER.lowHz, Q: 1.1 });
    const peak = new BiquadFilterNode(ctx, { type: 'peaking', frequency: SPEAKER.peakHz, Q: 1.2, gain: SPEAKER.peakDb });
    const lp1 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: SPEAKER.highHz, Q: 0.707 });
    const lp2 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: SPEAKER.highHz, Q: 0.9 });
    const shaper = new WaveShaperNode(ctx, { curve: speakerCurve(SPEAKER.drive), oversample: '2x' });

    node.connect(dry).connect(ctx.destination);
    node.connect(hp1).connect(hp2).connect(peak).connect(lp1).connect(lp2).connect(shaper).connect(wet);
    wet.connect(ctx.destination);

    this.node = node;
    this.dry = dry;
    this.wet = wet;
    this.applySpeaker(this.values.speaker, true);
    await resumed;
    for (const l of this.stateListeners) l(this.running);
  }

  /** Called whenever the context starts, suspends or resumes. */
  onStateChange(listener: (running: boolean) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  setParam(id: ParamId, value: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.node) return;
    if (id === 'speaker') {
      this.applySpeaker(value, false);
      return;
    }
    if (PARAM_BY_ID[id].mainThread) return;
    // The worklet smooths every continuous value per-sample, so a plain step is click-free.
    this.node.parameters.get(id)?.setValueAtTime(value, ctx.currentTime);
  }

  private applySpeaker(on: number, immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.dry || !this.wet) return;
    const t = ctx.currentTime;
    // The speaker path is louder after the peak + shaper; trim it.
    const wetLevel = on >= 0.5 ? 0.8 : 0;
    const dryLevel = on >= 0.5 ? 0 : 1;
    for (const [g, v] of [
      [this.dry.gain, dryLevel],
      [this.wet.gain, wetLevel],
    ] as const) {
      g.cancelScheduledValues(t);
      if (immediate) g.setValueAtTime(v, t);
      else g.setTargetAtTime(v, t, SWITCH_TC);
    }
  }

  private post(msg: ToWorklet): void {
    this.node?.port.postMessage(msg);
  }

  noteOn(note: number): void {
    this.post({ type: 'noteOn', note });
  }

  noteOff(note: number): void {
    this.post({ type: 'noteOff', note });
  }

  allNotesOff(): void {
    this.post({ type: 'allNotesOff' });
  }

  onMeter(listener: MeterListener): () => void {
    this.meterListeners.add(listener);
    return () => this.meterListeners.delete(listener);
  }

  /** Feed a microphone stream into the voice's breath follower. */
  connectMic(stream: MediaStream): void {
    if (!this.ctx || !this.node) throw new Error('Audio is not started');
    this.disconnectMic();
    this.micSource = new MediaStreamAudioSourceNode(this.ctx, { mediaStream: stream });
    this.micSource.connect(this.node);
  }

  disconnectMic(): void {
    this.micSource?.disconnect();
    this.micSource = null;
  }
}

/** Soft clip, like a small speaker pushed a little too hard. */
function speakerCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/**
 * Start (or resume) audio on the first user gesture anywhere on the page, and
 * again whenever the browser suspends the context later (e.g. iOS interruptions).
 */
export function startOnGesture(engine: Engine, onStarted: () => void, onError: (e: unknown) => void): void {
  const handler = () => {
    if (engine.running) return;
    engine.start().then(onStarted, onError);
  };
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(type, handler, { capture: true });
  }
}
