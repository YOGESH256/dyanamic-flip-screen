import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeVideo,
} from 'mediabunny';
import type { CropPath } from './path';
import type { Rect } from './types';

export interface ExportOptions {
  file: File;
  path: CropPath;
  /** Fallback rectangle when the path is empty. */
  fallback: Rect;
  /** Longest output edge in pixels. */
  maxEdge: number;
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

export async function isExportSupported(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return false;
  return canEncodeVideo('avc');
}

/**
 * Re-encodes the source video, cropping every frame to the interpolated path position.
 * Audio is copied as-is; time-varying volume and playback rate are preview-only.
 */
export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  const first = opts.path.sampleAt(0)?.rect ?? opts.fallback;
  const ratio = first.w / first.h;
  let outW: number;
  let outH: number;
  if (ratio >= 1) {
    outW = even(Math.min(opts.maxEdge, first.w));
    outH = even(outW / ratio);
  } else {
    outH = even(Math.min(opts.maxEdge, first.h));
    outW = even(outH * ratio);
  }

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const input = new Input({ source: new BlobSource(opts.file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: 'avc',
      quality: QUALITY_HIGH,
      forceTranscode: true,
      processedWidth: outW,
      processedHeight: outH,
      process: (sample) => {
        const r = opts.path.sampleAt(sample.timestamp)?.rect ?? opts.fallback;
        sample.draw(ctx, r.x, r.y, r.w, r.h, 0, 0, outW, outH);
        return canvas;
      },
    },
    audio: { codec: 'aac' },
  });

  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((t) => `${t.track.type}: ${t.reason}`).join('; ');
    throw new Error(`Cannot export this file (${reasons || 'unsupported input'})`);
  }

  conversion.onProgress = (p) => opts.onProgress(p);
  opts.signal?.addEventListener('abort', () => void conversion.cancel(), { once: true });

  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('Export produced no data');
  return { blob: new Blob([buffer], { type: 'video/mp4' }), width: outW, height: outH };
}
