import { CropBox } from './cropbox';
import { CropPath } from './path';
import { Preview } from './preview';
import { ASPECT_PRESETS, type Keyframe, type Rect } from './types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const app = $('app');
const dropzone = $('dropzone');
const workspace = $('workspace');
const stage = $('stage');
const video = $<HTMLVideoElement>('video');
const fileInput = $<HTMLInputElement>('fileInput');
const playPause = $<HTMLButtonElement>('playPause');
const timeLabel = $('timeLabel');
const rateSel = $<HTMLSelectElement>('rate');
const volumeCtl = $<HTMLInputElement>('volume');
const aspectChips = $('aspect');
const playIcon = $<SVGUseElement & HTMLElement>('playIcon');
const scrubTip = $('scrubTip');
const pathHint = $('pathHint');
const toasts = $('toasts');
const help = $('help');
const recordBtn = $<HTMLButtonElement>('record');
const clearBtn = $<HTMLButtonElement>('clearPath');
const timeline = $<HTMLCanvasElement>('timeline');
const cropMeta = $('cropMeta');
const kfMeta = $('kfMeta');
const exportBtn = $<HTMLButtonElement>('export');
const exportProgress = $('exportProgress');
const exportBar = exportProgress.querySelector<HTMLElement>('.bar')!;
const exportPct = exportProgress.querySelector<HTMLElement>('.pct')!;
const exportResult = $('exportResult');
const exportVideoEl = $<HTMLVideoElement>('exportVideo');
const exportDownload = $<HTMLAnchorElement>('exportDownload');
const maxEdgeSel = $<HTMLSelectElement>('maxEdge');
const jsonInput = $<HTMLInputElement>('jsonInput');

type Mode = 'edit' | 'replay';

const state = {
  file: null as File | null,
  path: new CropPath(),
  recording: false,
  lastRecordedT: 0,
  mode: 'edit' as Mode,
  aspect: 0,
  exporting: null as AbortController | null,
  resultUrl: '',
};

const box = new CropBox(stage);
const preview = new Preview(video, $<HTMLCanvasElement>('preview'), $('previewBox'));

// ---------- helpers ----------

let toastTimer = 0;
function setStatus(msg: string, kind: '' | 'error' | 'ok' = ''): void {
  if (!msg) return;
  toasts.replaceChildren();
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = msg;
  el.dataset.kind = kind;
  toasts.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, kind === 'error' ? 6000 : 3500);
}

function setHint(msg: string): void {
  pathHint.textContent = msg;
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function aspectValue(): number {
  const p = ASPECT_PRESETS[state.aspect];
  return p.w / p.h;
}

function aspectLabel(): string {
  return ASPECT_PRESETS[state.aspect].label;
}

/** Rendered rect of the video inside the stage under object-fit: contain. */
function renderedVideoRect(): { x: number; y: number; w: number; h: number } {
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.min(sw / vw, sh / vh);
  const w = vw * scale;
  const h = vh * scale;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

function layout(): void {
  if (!video.videoWidth) return;
  box.layout(renderedVideoRect());
  preview.invalidate();
  drawTimeline();
}

function currentKeyframe(): Keyframe {
  return { t: video.currentTime, rect: box.value, volume: video.volume, rate: video.playbackRate };
}

function applyPathAt(t: number): void {
  const kf = state.path.sampleAt(t);
  if (!kf) return;
  box.set(kf.rect);
  if (state.mode === 'replay') {
    video.volume = kf.volume;
    volumeCtl.value = String(kf.volume);
    if (video.playbackRate !== kf.rate) {
      video.playbackRate = kf.rate;
      rateSel.value = String(kf.rate);
    }
  }
}

function updateMeta(rect: Rect): void {
  cropMeta.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)} px, offset ${Math.round(rect.x)}, ${Math.round(rect.y)}`;
  const n = state.path.length;
  kfMeta.textContent = `${n} keyframe${n === 1 ? '' : 's'}`;
  if (state.mode === 'edit' && !state.recording) {
    setHint(n === 0
      ? 'Drag the frame to place it, then press Record and steer while it plays.'
      : `Path covers 0:00 to ${fmtTime(state.path.duration)}. Play to watch it, drag while paused to fix a keyframe, or record again over any span.`);
  }
}

function setMode(mode: Mode): void {
  state.mode = mode;
  app.dataset.mode = mode;
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => {
    const on = t.dataset.tab === mode;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  if (mode === 'replay') {
    stopRecording();
    recordBtn.disabled = true;
    rateSel.disabled = true;
    volumeCtl.disabled = true;
    if (state.path.length === 0) {
      setHint('No recorded session yet. Record one in the Edit tab or import a JSON file.');
    } else {
      setHint('Replaying the recorded session. Frame, volume and speed follow the JSON.');
      video.pause();
      video.currentTime = 0;
      applyPathAt(0);
    }
  } else {
    recordBtn.disabled = false;
    rateSel.disabled = false;
    volumeCtl.disabled = false;
    updateMeta(box.value);
  }
}

// ---------- file loading ----------

function loadFile(file: File): void {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) {
    setStatus('That does not look like a video file.', 'error');
    return;
  }
  stopRecording();
  state.path.clear();
  state.file = file;
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = URL.createObjectURL(file);
  video.load();
  app.dataset.state = 'loading';
  setStatus(`Loading ${file.name}…`);
  clearExportResult();
}

video.addEventListener('loadedmetadata', () => {
  dropzone.hidden = true;
  workspace.hidden = false;
  app.dataset.state = 'ready';
  box.setAspect(aspectValue(), aspectLabel());
  box.setSource(video.videoWidth, video.videoHeight);
  layout();
  preview.setRect(box.value);
  timeLabel.textContent = `0:00 / ${fmtTime(video.duration)}`;
  updateMeta(box.value);
  setStatus(`Loaded ${state.file?.name ?? 'video'} · ${video.videoWidth}×${video.videoHeight} · ${fmtTime(video.duration)}`, 'ok');
});

video.addEventListener('error', () => {
  app.dataset.state = 'empty';
  setStatus('Could not decode this video in the browser. Try an H.264 MP4.', 'error');
});

// ---------- drag and drop ----------

for (const evt of ['dragenter', 'dragover'] as const) {
  document.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('over');
  });
}
document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) dropzone.classList.remove('over');
});
$('dropCard').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  fileInput.click();
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
$('openFile').addEventListener('click', () => fileInput.click());
$('dropPick').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) loadFile(f);
  fileInput.value = '';
});

// ---------- playback controls ----------

function togglePlay(): void {
  if (!state.file) return;
  if (video.paused) void video.play();
  else video.pause();
}
playPause.addEventListener('click', togglePlay);
video.addEventListener('play', () => {
  playIcon.setAttribute('href', '#i-pause');
  playPause.setAttribute('aria-label', 'Pause');
});
video.addEventListener('pause', () => {
  playIcon.setAttribute('href', '#i-play');
  playPause.setAttribute('aria-label', 'Play');
});
video.addEventListener('ended', () => {
  if (state.recording) {
    stopRecording();
    setStatus(`Recording finished with ${state.path.length} keyframes.`, 'ok');
  }
});

video.addEventListener('seeked', () => {
  if (!state.recording) applyPathAt(video.currentTime);
  preview.invalidate();
});

rateSel.addEventListener('change', () => {
  video.playbackRate = Number(rateSel.value);
});
volumeCtl.addEventListener('input', () => {
  video.volume = Number(volumeCtl.value);
});

// ---------- crop box ----------

ASPECT_PRESETS.forEach((p, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.type = 'button';
  b.role = 'radio';
  b.setAttribute('aria-checked', String(i === state.aspect));
  b.dataset.index = String(i);
  const shape = document.createElement('span');
  shape.className = 'shape';
  const k = 22 / Math.max(p.w, p.h);
  shape.style.width = `${Math.round(p.w * k)}px`;
  shape.style.height = `${Math.round(p.h * k)}px`;
  b.append(shape, document.createTextNode(p.label));
  b.addEventListener('click', () => selectAspect(i));
  aspectChips.appendChild(b);
});

function selectAspect(i: number): void {
  if (i === state.aspect || state.mode === 'replay') return;
  const had = state.path.length;
  stopRecording();
  state.path.clear();
  state.aspect = i;
  aspectChips.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.index === String(i))));
  box.setAspect(aspectValue(), aspectLabel());
  if (had) setStatus('Ratio changed, so the recorded path was cleared.');
}
$('resetBox').addEventListener('click', () => box.reset());

box.onChange((rect, interactive) => {
  preview.setRect(rect);
  updateMeta(rect);
  // Dragging while paused and not recording edits the keyframe at the playhead.
  if (interactive && !state.recording && state.mode === 'edit' && state.path.length > 0 && video.paused) {
    state.path.set(currentKeyframe());
  }
});

new ResizeObserver(layout).observe(stage);

// ---------- recording ----------

function startRecording(): void {
  if (!state.file || state.mode !== 'edit') return;
  state.recording = true;
  state.lastRecordedT = video.currentTime;
  app.dataset.recording = 'true';
  recordBtn.classList.add('on');
  recordBtn.querySelector('.label')!.textContent = 'Stop';
  state.path.set(currentKeyframe());
  if (video.paused) void video.play();
  setHint('Recording. Drag the frame to follow the action. Press R or the button to stop.');
}

function stopRecording(): void {
  if (!state.recording) return;
  state.recording = false;
  app.dataset.recording = 'false';
  recordBtn.classList.remove('on');
  recordBtn.querySelector('.label')!.textContent = 'Record path';
  state.path.set(currentKeyframe());
  updateMeta(box.value);
}

recordBtn.addEventListener('click', () => {
  if (state.recording) {
    stopRecording();
    setStatus(`Recorded ${state.path.length} keyframes.`, 'ok');
  } else {
    startRecording();
  }
});

clearBtn.addEventListener('click', () => {
  stopRecording();
  state.path.clear();
  setStatus('Path cleared.');
});

// Per-frame loop: record while recording, follow the path otherwise.
let lastVideoTime = -1;
function tick(): void {
  if (state.file && video.videoWidth) {
    const t = video.currentTime;
    if (t !== lastVideoTime) {
      lastVideoTime = t;
      timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(video.duration)}`;
      if (state.recording && !video.paused) {
        // Going forward: wipe whatever was previously recorded in this span, then write the new sample.
        if (t > state.lastRecordedT) state.path.clearRange(state.lastRecordedT, t);
        state.path.set(currentKeyframe());
        state.lastRecordedT = t;
      } else if (!state.recording && !video.paused) {
        applyPathAt(t);
      }
      drawTimeline();
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- timeline ----------

function drawTimeline(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = timeline.clientWidth;
  const h = timeline.clientHeight;
  if (!w) return;
  if (timeline.width !== w * dpr || timeline.height !== h * dpr) {
    timeline.width = w * dpr;
    timeline.height = h * dpr;
  }
  const ctx = timeline.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const dur = video.duration || 1;
  const trackY = 14;
  const trackH = 12;
  // Track background
  ctx.fillStyle = '#1c212c';
  roundRect(ctx, 0, trackY, w, trackH, 4);
  ctx.fill();
  // Played portion
  const px = (video.currentTime / dur) * w;
  ctx.fillStyle = '#323a48';
  roundRect(ctx, 0, trackY, Math.max(0, px), trackH, 4);
  ctx.fill();
  // Recorded coverage: contiguous runs of keyframes (gap > 0.5s splits a run)
  const kfs = state.path.keyframes;
  if (kfs.length) {
    ctx.fillStyle = state.recording ? 'rgba(255, 77, 109, .75)' : 'rgba(124, 92, 255, .85)';
    let runStart = kfs[0].t;
    let prev = kfs[0].t;
    const flush = (a: number, b: number): void => {
      const x0 = (a / dur) * w;
      const x1 = (b / dur) * w;
      roundRect(ctx, x0, trackY + 3, Math.max(3, x1 - x0), trackH - 6, 3);
      ctx.fill();
    };
    for (let i = 1; i < kfs.length; i++) {
      if (kfs[i].t - prev > 0.5) {
        flush(runStart, prev);
        runStart = kfs[i].t;
      }
      prev = kfs[i].t;
    }
    flush(runStart, prev);
  }
  // Playhead
  ctx.fillStyle = state.recording ? '#ff4d6d' : '#fff';
  roundRect(ctx, px - 1.5, 6, 3, h - 12, 1.5);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

let seeking = false;
function scrubTo(clientX: number): void {
  const r = timeline.getBoundingClientRect();
  const t = clamp01((clientX - r.left) / r.width) * video.duration;
  video.currentTime = t;
  if (!state.recording) applyPathAt(t);
  scrubTip.textContent = fmtTime(t);
  scrubTip.style.left = `${clamp01((clientX - r.left) / r.width) * 100}%`;
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
timeline.addEventListener('pointerdown', (e) => {
  if (!video.duration) return;
  e.preventDefault();
  seeking = true;
  timeline.setPointerCapture(e.pointerId);
  scrubTip.hidden = false;
  scrubTo(e.clientX);
});
timeline.addEventListener('pointermove', (e) => {
  if (!video.duration) return;
  if (seeking) {
    scrubTo(e.clientX);
  } else {
    const r = timeline.getBoundingClientRect();
    const k = clamp01((e.clientX - r.left) / r.width);
    scrubTip.hidden = false;
    scrubTip.textContent = fmtTime(k * video.duration);
    scrubTip.style.left = `${k * 100}%`;
  }
});
for (const evt of ['pointerup', 'pointercancel'] as const) {
  timeline.addEventListener(evt, () => {
    seeking = false;
    scrubTip.hidden = true;
  });
}
timeline.addEventListener('pointerleave', () => {
  if (!seeking) scrubTip.hidden = true;
});

state.path.onChange(() => {
  updateMeta(box.value);
  drawTimeline();
});

// ---------- JSON in / out ----------

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

$('downloadJson').addEventListener('click', () => {
  if (state.path.length === 0) {
    setStatus('Nothing recorded yet.', 'error');
    return;
  }
  const json = JSON.stringify(state.path.toJSON(), null, 2);
  download(new Blob([json], { type: 'application/json' }), 'dynamic-flip-session.json');
});

$('importJson').addEventListener('click', () => jsonInput.click());
jsonInput.addEventListener('change', async () => {
  const f = jsonInput.files?.[0];
  jsonInput.value = '';
  if (!f) return;
  try {
    const imported = CropPath.fromJSON(JSON.parse(await f.text()));
    if (imported.length === 0) throw new Error('File has no keyframes');
    stopRecording();
    // Match the ratio dropdown to the imported path so the box does not fight it.
    const first = imported.keyframes[0].rect;
    const ratio = first.w / first.h;
    let best = 0;
    ASPECT_PRESETS.forEach((p, i) => {
      if (Math.abs(p.w / p.h - ratio) < Math.abs(ASPECT_PRESETS[best].w / ASPECT_PRESETS[best].h - ratio)) best = i;
    });
    state.aspect = best;
    aspectChips.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.index === String(best))));
    box.setAspect(aspectValue(), aspectLabel());
    state.path.clear();
    for (const kf of imported.keyframes) state.path.set(kf);
    applyPathAt(video.currentTime);
    setStatus(`Imported ${imported.length} keyframes.`, 'ok');
  } catch (err) {
    setStatus(`Import failed: ${(err as Error).message}`, 'error');
  }
});

// ---------- export ----------

function clearExportResult(): void {
  exportResult.hidden = true;
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = '';
  exportVideoEl.removeAttribute('src');
}

exportBtn.addEventListener('click', async () => {
  if (!state.file) return;
  if (state.exporting) {
    state.exporting.abort();
    return;
  }
  stopRecording();
  video.pause();
  clearExportResult();
  const ctrl = new AbortController();
  state.exporting = ctrl;
  exportBtn.textContent = 'Cancel';
  exportProgress.hidden = false;
  exportBar.style.width = '0%';
  exportPct.textContent = '0%';
  setHint('Exporting on your machine. Speed depends on your hardware.');
  const started = performance.now();
  try {
    const { exportVideo } = await import('./exporter');
    const result = await exportVideo({
      file: state.file,
      path: state.path,
      fallback: box.value,
      maxEdge: Number(maxEdgeSel.value),
      signal: ctrl.signal,
      onProgress: (p) => {
        exportBar.style.width = `${(p * 100).toFixed(1)}%`;
        exportPct.textContent = `${Math.round(p * 100)}%`;
      },
    });
    state.resultUrl = URL.createObjectURL(result.blob);
    exportVideoEl.src = state.resultUrl;
    exportDownload.href = state.resultUrl;
    exportResult.hidden = false;
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    const mb = (result.blob.size / 1e6).toFixed(1);
    setStatus(`Exported ${result.width}×${result.height} · ${mb} MB · ${secs}s`, 'ok');
    exportResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    if (ctrl.signal.aborted) setStatus('Export cancelled.');
    else setStatus(`Export failed: ${(err as Error).message}`, 'error');
  } finally {
    state.exporting = null;
    exportBtn.textContent = 'Export MP4';
    exportProgress.hidden = true;
    updateMeta(box.value);
  }
});

// ---------- tabs and keyboard ----------

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => {
  t.addEventListener('click', () => setMode(t.dataset.tab as Mode));
});

function toggleHelp(force?: boolean): void {
  help.hidden = force === undefined ? !help.hidden : !force;
}
$('helpBtn').addEventListener('click', () => toggleHelp());
$('helpClose').addEventListener('click', () => toggleHelp(false));
help.addEventListener('click', (e) => {
  if (e.target === help) toggleHelp(false);
});

document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
  if (e.key === '?') {
    toggleHelp();
    return;
  }
  if (e.key === 'Escape' && !help.hidden) {
    toggleHelp(false);
    return;
  }
  if (!state.file) return;
  if (/^[1-6]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
    selectAspect(Number(e.key) - 1);
    return;
  }
  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'r':
    case 'R':
      if (state.mode === 'edit') recordBtn.click();
      break;
    case 'ArrowLeft':
    case 'ArrowRight': {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 1 / 30;
      const t = Math.max(0, Math.min(video.duration, video.currentTime + (e.key === 'ArrowLeft' ? -step : step)));
      video.currentTime = t;
      if (!state.recording) applyPathAt(t);
      break;
    }
  }
});

// ---------- capability check ----------

void import('./exporter').then((m) => m.isExportSupported()).then((ok) => {
  if (!ok) {
    exportBtn.disabled = true;
    $('exportNote').textContent = 'Export needs WebCodecs with H.264 support: Chrome 94+, Edge 94+, Firefox 130+, or Safari 26+. Preview and JSON still work here.';
  }
});
