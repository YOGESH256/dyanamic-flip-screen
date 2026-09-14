export function checkpointAt(checkpoints, time) {
  return checkpoints.findLast((point) => point.time <= time) ?? null;
}

export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// LCS produces a real line diff. Large inputs fall back to a bounded comparison.
export function diffLines(before, after) {
  if (before === after) return before.split('\n').map((text, i) => ({ type: 'same', text, oldLine: i + 1, newLine: i + 1 }));
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  if (a.length * b.length > 1_000_000) return [
    ...a.map((text, i) => ({ type: 'removed', text, oldLine: i + 1 })),
    ...b.map((text, i) => ({ type: 'added', text, newLine: i + 1 })),
  ];
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push({ type: 'same', text: a[i], oldLine: ++i, newLine: ++j });
    else if (i < a.length && (j === b.length || dp[i + 1][j] >= dp[i][j + 1])) out.push({ type: 'removed', text: a[i], oldLine: ++i });
    else out.push({ type: 'added', text: b[j], newLine: ++j });
  }
  return out;
}

export function lineTimes(checkpoints, file, until) {
  let previous = [], times = [];
  for (const checkpoint of checkpoints) {
    if (checkpoint.time > until) break;
    if (!(file in checkpoint.files)) { previous = []; times = []; continue; }
    const code = checkpoint.files[file];
    const diff = diffLines(previous.join('\n'), code);
    const nextTimes = [];
    for (const row of diff) {
      if (row.type === 'same') nextTimes.push(times[row.oldLine - 1] ?? checkpoint.time);
      if (row.type === 'added') nextTimes.push(checkpoint.time);
    }
    previous = code.split('\n');
    times = nextTimes;
  }
  return times;
}

export function validateProject(input) {
  if (!input || input.version !== 1 || typeof input.title !== 'string' || input.title.length > 200) throw new Error('This is not a Retrace project (version 1).');
  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 86400) throw new Error('Invalid video duration.');
  if (!Array.isArray(input.checkpoints) || input.checkpoints.length > 2000) throw new Error('Invalid checkpoint list.');
  let previous = -1, totalBytes = 0;
  for (const point of input.checkpoints) {
    if (!Number.isFinite(point.time) || point.time < 0 || point.time > input.duration || point.time <= previous) throw new Error('Checkpoints must have increasing timestamps within the video.');
    previous = point.time;
    if (!point.files || typeof point.files !== 'object' || Array.isArray(point.files) || Object.keys(point.files).length > 100) throw new Error('Invalid project files.');
    for (const [name, code] of Object.entries(point.files)) {
      if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(name) || name.split('/').some((p) => p === '..' || p === '.') || ['__proto__', 'constructor', 'prototype'].includes(name) || typeof code !== 'string' || code.length > 200000) throw new Error('Invalid file name or file content.');
      totalBytes += code.length;
    }
  }
  if (totalBytes > 10_000_000) throw new Error('Project is too large (10 MB maximum).');
  return {
    version: 1, title: input.title, duration: input.duration,
    kind: input.kind === 'demo' ? 'demo' : 'imported',
    checkpoints: input.checkpoints.map((p) => ({
      id: String(p.id ?? `cp-${p.time}`).slice(0, 80), time: p.time,
      title: String(p.title ?? 'Checkpoint').slice(0, 120),
      note: String(p.note ?? '').slice(0, 500),
      source: p.source === 'ocr' ? 'ocr' : 'imported',
      // Imported metadata is a label, never independent verification.
      reviewed: false, confidence: Number.isFinite(p.confidence) ? Math.max(0, Math.min(100, p.confidence)) : null,
      files: { ...p.files },
    })),
  };
}
