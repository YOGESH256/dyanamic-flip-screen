import { clamp } from './path';
import type { Rect } from './types';

type Handle = 'nw' | 'ne' | 'sw' | 'se';
const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];

/**
 * Movable, resizable, aspect-locked crop rectangle drawn over a video.
 * Internal state is in source-video pixels; the DOM is scaled to the rendered video rect.
 */
export class CropBox {
  readonly el: HTMLDivElement;
  private rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private srcW = 1;
  private srcH = 1;
  private ratio = 9 / 16;
  private scale = 1; // display px per source px
  private offset = { x: 0, y: 0 }; // rendered video origin inside stage
  private listeners = new Set<(rect: Rect, interactive: boolean) => void>();
  private minSize = 32;

  constructor(stage: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'cropbox';
    this.el.hidden = true;
    for (const h of HANDLES) {
      const d = document.createElement('div');
      d.className = `handle ${h}`;
      d.dataset.handle = h;
      this.el.appendChild(d);
    }
    stage.appendChild(this.el);
    this.el.addEventListener('pointerdown', this.onPointerDown);
  }

  get value(): Rect {
    return { ...this.rect };
  }

  onChange(fn: (rect: Rect, interactive: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Call when a new video loads. Resets to a full-height box centred horizontally. */
  setSource(w: number, h: number): void {
    this.srcW = w;
    this.srcH = h;
    this.el.hidden = false;
    this.reset();
  }

  setAspect(ratio: number): void {
    this.ratio = ratio;
    this.reset();
  }

  /** Full-height box for the current ratio, centred. */
  reset(): void {
    let h = this.srcH;
    let w = h * this.ratio;
    if (w > this.srcW) {
      w = this.srcW;
      h = w / this.ratio;
    }
    this.commit({ x: (this.srcW - w) / 2, y: (this.srcH - h) / 2, w, h }, false);
  }

  /** Programmatic update (from path playback). Not treated as user interaction. */
  set(rect: Rect): void {
    this.commit(this.constrain(rect), false);
  }

  /** Recompute display scale after the stage or video size changes. */
  layout(renderedVideo: { x: number; y: number; w: number; h: number }): void {
    this.scale = renderedVideo.w / this.srcW;
    this.offset = { x: renderedVideo.x, y: renderedVideo.y };
    this.render();
  }

  private constrain(r: Rect): Rect {
    let w = clamp(r.w, this.minSize, this.srcW);
    let h = w / this.ratio;
    if (h > this.srcH) {
      h = this.srcH;
      w = h * this.ratio;
    }
    return {
      x: clamp(r.x, 0, this.srcW - w),
      y: clamp(r.y, 0, this.srcH - h),
      w,
      h,
    };
  }

  private commit(rect: Rect, interactive: boolean): void {
    this.rect = rect;
    this.render();
    for (const fn of this.listeners) fn(this.value, interactive);
  }

  private render(): void {
    const s = this.el.style;
    s.transform = `translate(${this.offset.x + this.rect.x * this.scale}px, ${this.offset.y + this.rect.y * this.scale}px)`;
    s.width = `${this.rect.w * this.scale}px`;
    s.height = `${this.rect.h * this.scale}px`;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    const start = { x: e.clientX, y: e.clientY };
    const startRect = this.value;
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add('active');

    const move = (ev: PointerEvent): void => {
      const dx = (ev.clientX - start.x) / this.scale;
      const dy = (ev.clientY - start.y) / this.scale;
      const next = handle ? this.resize(startRect, handle, dx, dy) : { ...startRect, x: startRect.x + dx, y: startRect.y + dy };
      this.commit(this.constrain(next), true);
    };
    const up = (): void => {
      this.el.removeEventListener('pointermove', move);
      this.el.removeEventListener('pointerup', up);
      this.el.removeEventListener('pointercancel', up);
      this.el.classList.remove('active');
    };
    this.el.addEventListener('pointermove', move);
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
  };

  /** Resize from a corner, keeping the opposite corner anchored and the aspect ratio locked. */
  private resize(r: Rect, handle: Handle, dx: number, dy: number): Rect {
    const east = handle.includes('e');
    const south = handle.includes('s');
    const anchorX = east ? r.x : r.x + r.w;
    const anchorY = south ? r.y : r.y + r.h;
    // Drive size from the dominant axis of the drag so the box follows the cursor naturally.
    const wFromX = r.w + (east ? dx : -dx);
    const wFromY = (r.h + (south ? dy : -dy)) * this.ratio;
    let w = Math.abs(dx) * this.ratio > Math.abs(dy) ? wFromX : wFromY;
    w = Math.max(this.minSize, w);
    // Keep inside the frame relative to the anchor.
    const maxW = Math.min(east ? this.srcW - anchorX : anchorX, (south ? this.srcH - anchorY : anchorY) * this.ratio);
    w = Math.min(w, maxW);
    const h = w / this.ratio;
    return { x: east ? anchorX : anchorX - w, y: south ? anchorY : anchorY - h, w, h };
  }
}
