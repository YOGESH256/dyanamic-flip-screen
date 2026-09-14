import type { Rect } from './types';

/**
 * Draws the cropped region of the video into a canvas that fits inside a fixed-size
 * container without changing the container's size. Redraws on every animation frame
 * while the video is playing, and on demand otherwise.
 */
export class Preview {
  private ctx: CanvasRenderingContext2D;
  private rect: Rect | null = null;
  private raf = 0;
  private dirty = false;

  constructor(private video: HTMLVideoElement, private canvas: HTMLCanvasElement, private box: HTMLElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    const loop = (): void => {
      if (!this.video.paused && !this.video.ended) this.dirty = true;
      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setRect(rect: Rect): void {
    this.rect = rect;
    this.dirty = true;
  }

  invalidate(): void {
    this.dirty = true;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  private draw(): void {
    const r = this.rect;
    if (!r || !this.video.videoWidth) return;
    const bw = this.box.clientWidth;
    const bh = this.box.clientHeight;
    if (!bw || !bh) return;
    const ratio = r.w / r.h;
    let w = bh * ratio;
    let h = bh;
    if (w > bw) {
      w = bw;
      h = bw / ratio;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.ctx.drawImage(this.video, r.x, r.y, r.w, r.h, 0, 0, pw, ph);
  }
}
