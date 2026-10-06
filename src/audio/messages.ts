/** Main thread -> worklet. */
export type ToWorklet =
  | { type: 'noteOn'; note: number }
  | { type: 'noteOff'; note: number }
  | { type: 'allNotesOff' };

/** Worklet -> main thread. */
export type FromWorklet = { type: 'meter'; breath: number; mic: number; output: number };
