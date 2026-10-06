function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

/**
 * 2:1 decimator with a Kaiser-windowed half-band FIR. Every even tap except
 * the centre is zero, so only the odd taps are stored and evaluated.
 */
export class HalfbandDecimator {
  /** Odd taps h[1], h[3], ..., h[order] (the filter is symmetric). */
  readonly taps: Float64Array;
  private readonly order: number;
  private readonly len: number;
  private readonly buf: Float64Array;
  private pos = 0;

  /** @param order half-length M (odd). Filter length is 2M + 1. */
  constructor(order = 27, beta = 7.5) {
    if (order % 2 === 0) throw new Error('order must be odd');
    this.order = order;
    this.len = 2 * order + 1;
    this.buf = new Float64Array(2 * this.len);
    const n = (order + 1) / 2;
    this.taps = new Float64Array(n);
    const i0b = besselI0(beta);
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const k = 2 * j + 1;
      const sinc = Math.sin((Math.PI * k) / 2) / (Math.PI * k);
      const r = k / order;
      const w = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
      this.taps[j] = sinc * w;
      sum += 2 * this.taps[j]!;
    }
    // Unity gain at DC: centre tap (0.5) + odd taps must sum to 1.
    for (let j = 0; j < n; j++) this.taps[j]! *= 0.5 / sum;
  }

  private push(x: number): void {
    this.buf[this.pos] = x;
    this.buf[this.pos + this.len] = x;
    if (++this.pos === this.len) this.pos = 0;
  }

  /** Feed two oversampled samples, get one output sample. */
  process(a: number, b: number): number {
    this.push(a);
    this.push(b);
    const buf = this.buf;
    const c = this.pos + this.order;
    let y = 0.5 * buf[c]!;
    const taps = this.taps;
    for (let j = 0, k = 1; j < taps.length; j++, k += 2) {
      y += taps[j]! * (buf[c - k]! + buf[c + k]!);
    }
    return y;
  }
}
