/** Result of a key press/release, as seen by a monophonic voice. */
export interface NoteChange {
  /** Note the voice should now play, or null when no key is held. */
  readonly note: number | null;
  /** True if the sounding pitch changed because of this event. */
  readonly changed: boolean;
  /** True if the change happened while another key was already held. */
  readonly legato: boolean;
}

const MAX_HELD = 64;

/** Held-key stack with last-note priority. */
export class NoteStack {
  private held: number[] = [];

  get current(): number | null {
    return this.held.length ? this.held[this.held.length - 1]! : null;
  }

  get size(): number {
    return this.held.length;
  }

  press(note: number): NoteChange {
    const legato = this.held.length > 0;
    this.remove(note);
    this.held.push(note);
    if (this.held.length > MAX_HELD) this.held.shift();
    return { note, changed: true, legato };
  }

  release(note: number): NoteChange {
    const idx = this.held.indexOf(note);
    if (idx < 0) return { note: this.current, changed: false, legato: false };
    const wasSounding = idx === this.held.length - 1;
    this.held.splice(idx, 1);
    if (!wasSounding) return { note: this.current, changed: false, legato: false };
    const next = this.current;
    return { note: next, changed: true, legato: next !== null };
  }

  clear(): void {
    this.held.length = 0;
  }

  private remove(note: number): void {
    const idx = this.held.indexOf(note);
    if (idx >= 0) this.held.splice(idx, 1);
  }
}
