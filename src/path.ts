import type { Keyframe, KeyframeJson, Rect } from './types';

const EPS = 1 / 120; // keyframes closer than this in time are merged

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/**
 * Time-ordered list of keyframes with linear interpolation between them.
 * All mutation goes through this class so the list stays sorted and deduped.
 */
export class CropPath {
  private frames: Keyframe[] = [];
  private listeners = new Set<() => void>();

  get length(): number {
    return this.frames.length;
  }

  get keyframes(): readonly Keyframe[] {
    return this.frames;
  }

  get duration(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Index of the last keyframe with t <= time, or -1. */
  private indexAtOrBefore(time: number): number {
    let lo = 0;
    let hi = this.frames.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].t <= time) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  /** Insert or replace the keyframe at `kf.t`. */
  set(kf: Keyframe): void {
    const i = this.indexAtOrBefore(kf.t);
    if (i >= 0 && Math.abs(this.frames[i].t - kf.t) < EPS) {
      this.frames[i] = kf;
    } else if (i + 1 < this.frames.length && Math.abs(this.frames[i + 1].t - kf.t) < EPS) {
      this.frames[i + 1] = kf;
    } else {
      this.frames.splice(i + 1, 0, kf);
    }
    this.emit();
  }

  /** Remove every keyframe with from < t <= to (used when re-recording over a span). */
  clearRange(from: number, to: number): void {
    const before = this.frames.length;
    this.frames = this.frames.filter((f) => !(f.t > from && f.t <= to));
    if (this.frames.length !== before) this.emit();
  }

  clear(): void {
    if (!this.frames.length) return;
    this.frames = [];
    this.emit();
  }

  /** Interpolated state at `time`. Clamps to the first/last keyframe outside the recorded span. */
  sampleAt(time: number): Keyframe | null {
    const n = this.frames.length;
    if (n === 0) return null;
    if (time <= this.frames[0].t) return this.frames[0];
    if (time >= this.frames[n - 1].t) return this.frames[n - 1];
    const i = this.indexAtOrBefore(time);
    const a = this.frames[i];
    const b = this.frames[i + 1];
    const span = b.t - a.t;
    const k = span > 0 ? (time - a.t) / span : 0;
    return {
      t: time,
      rect: {
        x: lerp(a.rect.x, b.rect.x, k),
        y: lerp(a.rect.y, b.rect.y, k),
        w: lerp(a.rect.w, b.rect.w, k),
        h: lerp(a.rect.h, b.rect.h, k),
      },
      volume: lerp(a.volume, b.volume, k),
      rate: k < 0.5 ? a.rate : b.rate,
    };
  }

  toJSON(): KeyframeJson[] {
    return this.frames.map((f) => ({
      timeStamp: round(f.t, 3),
      coordinates: [round(f.rect.x), round(f.rect.y), round(f.rect.w), round(f.rect.h)],
      volume: round(f.volume, 2),
      playbackRate: f.rate,
    }));
  }

  static fromJSON(data: unknown): CropPath {
    if (!Array.isArray(data)) throw new Error('Expected a JSON array of keyframes');
    const path = new CropPath();
    for (const item of data) {
      const kf = parseKeyframe(item);
      path.frames.push(kf);
    }
    path.frames.sort((a, b) => a.t - b.t);
    return path;
  }
}

function parseKeyframe(item: unknown): Keyframe {
  if (typeof item !== 'object' || item === null) throw new Error('Keyframe must be an object');
  const o = item as Record<string, unknown>;
  const c = o.coordinates;
  if (!Array.isArray(c) || c.length !== 4 || !c.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('coordinates must be [x, y, width, height]');
  }
  const t = num(o.timeStamp, 't');
  const rect: Rect = { x: c[0], y: c[1], w: c[2], h: c[3] };
  if (rect.w <= 0 || rect.h <= 0) throw new Error('width and height must be positive');
  return {
    t,
    rect,
    volume: clamp(typeof o.volume === 'number' ? o.volume : 1, 0, 1),
    rate: typeof o.playbackRate === 'number' && o.playbackRate > 0 ? o.playbackRate : 1,
  };
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a number`);
  return v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}
