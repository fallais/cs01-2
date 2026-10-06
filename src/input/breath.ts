import type { Synth } from '../synth';

/**
 * Microphone breath source. The raw mic signal goes straight into the voice
 * worklet, whose envelope follower turns blowing into a 0..1 breath level.
 */
export class MicBreath {
  private stream: MediaStream | null = null;
  private readonly synth: Synth;

  constructor(synth: Synth) {
    this.synth = synth;
  }

  get enabled(): boolean {
    return this.stream !== null;
  }

  /** Must be called from a user gesture. Throws a user-readable Error on failure. */
  async enable(): Promise<void> {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone input is not available (needs HTTPS or localhost).');
    }
    await this.synth.engine.start();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Processing meant for speech would fight the follower.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      throw new Error(
        name === 'NotAllowedError' ? 'Microphone permission was denied.' : name === 'NotFoundError' ? 'No microphone found.' : 'Could not open the microphone.',
      );
    }
    this.stream = stream;
    this.synth.engine.connectMic(stream);
  }

  disable(): void {
    this.synth.engine.disconnectMic();
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
  }
}
