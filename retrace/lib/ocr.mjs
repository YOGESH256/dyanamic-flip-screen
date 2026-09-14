const median = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 1;
};

// TSV geometry retains indentation that plain OCR output would discard.
export function parseTsv(tsv) {
  const groups = new Map();
  for (const row of tsv.split('\n').slice(1)) {
    const cells = row.split('\t');
    if (cells.length < 12 || cells[0] !== '5' || !cells.slice(11).join('\t').trim()) continue;
    const [,,,,,, left, top, width, height, confidence] = cells;
    const key = cells.slice(1, 5).join(':');
    const word = { left: +left, top: +top, width: +width, height: +height, confidence: +confidence, text: cells.slice(11).join('\t').trim() };
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(word);
  }
  const lines = [...groups.values()].map((words) => words.sort((a, b) => a.left - b.left)).sort((a, b) => a[0].top - b[0].top);
  if (!lines.length) return { code: '', confidence: 0, uncertainLines: [], lineNumbers: null };
  const widths = lines.flat().filter((w) => w.text.length >= 3).map((w) => w.width / w.text.length);
  const charWidth = median(widths.length ? widths : lines.flat().map((w) => w.width / w.text.length));
  const numbered = lines.length >= 3 && lines.filter((words) => words.length > 1 && /^\d{1,5}$/.test(words[0].text)).length === lines.length;
  const numberList = numbered ? lines.map((words) => +words[0].text) : null;
  const hasNumbers = numbered && numberList.every((n, i) => n > 0 && n <= 10000 && (i === 0 || n > numberList[i - 1]));
  const contentLines = hasNumbers ? lines.map((words) => words.slice(1)) : lines;
  const leftEdge = Math.min(...contentLines.map((words) => words[0].left));
  const code = [], uncertainLines = [];
  for (const [i, words] of contentLines.entries()) {
    let value = ' '.repeat(Math.max(0, Math.min(40, Math.round((words[0].left - leftEdge) / charWidth))));
    let right = words[0].left;
    for (const [index, word] of words.entries()) {
      if (index) value += ' '.repeat(Math.max(1, Math.min(40, Math.round((word.left - right) / charWidth))));
      value += word.text;
      right = word.left + word.width;
    }
    code.push(value);
    if (words.some((word) => word.confidence < 80)) uncertainLines.push(i + 1);
  }
  const words = contentLines.flat();
  return { code: code.join('\n'), confidence: Math.round(words.reduce((sum, w) => sum + w.confidence, 0) / words.length), uncertainLines, lineNumbers: hasNumbers ? numberList : null };
}

// Only numbered lines establish positions in a file. Otherwise each observation
// remains its own visible snapshot; we never guess unseen file contents.
export function reconcileObservation(previous, observation) {
  if (!observation.lineNumbers) return { code: observation.code, numbered: null, partial: true };
  const numbered = { ...(previous?.numbered ?? {}) };
  const lines = observation.code.split('\n');
  observation.lineNumbers.forEach((number, i) => { numbered[number] = lines[i]; });
  const max = Math.max(...Object.keys(numbered).map(Number));
  const result = [];
  let hasGaps = false;
  for (let i = 1; i <= max; i++) {
    if (!(i in numbered)) hasGaps = true;
    result.push(numbered[i] ?? `// [Retrace: line ${i} not observed]`);
  }
  return { code: result.join('\n'), numbered, partial: true, hasGaps };
}
