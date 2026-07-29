/**
 * Shared OCR extraction for the CARS reference corpus.
 *
 * COPYRIGHT GUARDRAIL — read before editing.
 * Functions here return source text *in memory only*. Callers must reduce that text to
 * aggregate measurements before writing anything to disk or stdout. No caller may
 * persist a stem, an option, or a passage sentence. Two callers exist:
 *   - `profile-corpus.mjs`   → emits structural metrics
 *   - `tools/cars-generator/src/calibrate.ts` → emits solver accuracy rates
 * Both retain numbers only.
 *
 * This module exists so those two callers parse screenshots identically. A calibration
 * baseline measured with different extraction than the profiler would not describe the
 * same corpus.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Words below this OCR confidence are dropped as noise. */
export const MIN_CONFIDENCE = 40;

/**
 * Application chrome present on every screenshot and never item content. Matched
 * case-insensitively against whole lines so it cannot enter any count.
 */
const CHROME_PATTERNS = [
  /highlight/i,
  /strikethrough/i,
  /flag for review/i,
  /color scheme/i,
  /time remaining/i,
  /^pause$/i,
  /navigation/i,
  /^next/i,
  /^previous/i,
  /sample test/i,
  /demo test/i,
  /mcatofficialprep/i,
  /^https?:/i,
];

/** Recursively collects PNG paths, optionally keeping only paths matching a substring. */
export function findImages(root, matches = []) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.png$/i.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  if (matches.length === 0) return found;
  return found.filter((p) => matches.some((m) => p.includes(m)));
}

/** Runs tesseract and returns word rows with bounding boxes. Text stays in memory. */
export function ocrWords(imagePath) {
  const tsv = execFileSync('tesseract', [imagePath, 'stdout', 'tsv'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const rows = [];
  const lines = tsv.split('\n');
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split('\t');
    if (parts.length < 12) continue;
    const text = parts[11];
    const conf = Number(parts[10]);
    if (!text || text.trim() === '' || !Number.isFinite(conf) || conf < MIN_CONFIDENCE) continue;
    rows.push({
      block: Number(parts[2]),
      par: Number(parts[3]),
      line: Number(parts[4]),
      left: Number(parts[6]),
      top: Number(parts[7]),
      width: Number(parts[8]),
      text: text.trim(),
    });
  }
  return rows;
}

/** Groups words into lines, preserving reading order and the x-position of each line start. */
export function toLines(words) {
  const byLine = new Map();
  for (const w of words) {
    const key = `${w.block}:${w.par}:${w.line}`;
    let entry = byLine.get(key);
    if (!entry) {
      entry = { key, block: w.block, par: w.par, top: w.top, left: w.left, words: [] };
      byLine.set(key, entry);
    }
    entry.top = Math.min(entry.top, w.top);
    entry.left = Math.min(entry.left, w.left);
    entry.words.push(w.text);
  }
  return [...byLine.values()]
    .sort((a, b) => a.top - b.top)
    .map((l) => ({ ...l, text: l.words.join(' ') }));
}

export function isChrome(text) {
  return CHROME_PATTERNS.some((re) => re.test(text));
}

/**
 * Splits a page into the passage pane and the question pane.
 *
 * The split happens at the *word* level, before grouping into lines: tesseract
 * frequently merges a passage line and a choice line sharing a y-band into one line,
 * which would otherwise pull choice text into the passage.
 */
export function splitPanes(words, pageWidth) {
  const midpoint = pageWidth / 2;
  const leftWords = [];
  const rightWords = [];
  for (const w of words) {
    (w.left + w.width / 2 < midpoint ? leftWords : rightWords).push(w);
  }
  return {
    left: toLines(leftWords).filter((l) => !isChrome(l.text)),
    right: toLines(rightWords).filter((l) => !isChrome(l.text)),
  };
}

/** Extracts the stem and options from the question pane. */
export function extractItem(rightLines) {
  // The radio-button glyph OCRs as assorted punctuation ahead of the option letter, so
  // leading non-alphanumerics are stripped before the marker is matched.
  const glyphPrefix = /^[^A-Za-z0-9]+/;
  const optionMarker = /^([A-D])[).:.\s]\s*/;
  const stemLines = [];
  const options = [];
  let current = null;
  let seenHeader = false;

  for (const line of rightLines) {
    const raw = line.text.trim();
    if (!raw) continue;
    if (/^question\s+\d+\b/i.test(raw)) {
      seenHeader = true;
      const remainder = raw.replace(/^question\s+\d+\.?\s*/i, '').trim();
      if (remainder) stemLines.push(remainder);
      continue;
    }

    const stripped = raw.replace(glyphPrefix, '');
    const marker = optionMarker.exec(stripped);
    // Accept any not-yet-seen option letter that advances the sequence: requiring the
    // exact next letter loses every remaining option whenever OCR garbles one marker.
    const lastLabel = options.length ? options[options.length - 1].label : null;
    if (marker && (lastLabel === null || marker[1] > lastLabel)) {
      current = { label: marker[1], text: stripped.slice(marker[0].length).trim() };
      options.push(current);
      continue;
    }

    if (current) {
      current.text += ` ${raw}`;
    } else if (seenHeader) {
      stemLines.push(raw);
    }
  }

  return { stem: stemLines.join(' ').trim(), options };
}

/** Identifies the passage set from its header, and returns the passage prose. */
export function extractPassage(leftLines) {
  const setHeader = leftLines.find((l) => /^passage\s+\d+/i.test(l.text.trim()));
  let itemsInSet = null;
  let setKey = null;
  if (setHeader) {
    const passageNum = /^passage\s+(\d+)/i.exec(setHeader.text.trim());
    const range = /questions?\s+(\d+)\s*[–—-]\s*(\d+)/i.exec(setHeader.text);
    if (range) itemsInSet = Number(range[2]) - Number(range[1]) + 1;
    else if (/question\s+\d+\s*\)/i.test(setHeader.text)) itemsInSet = 1;
    if (passageNum) setKey = `p${passageNum[1]}:${range ? `${range[1]}-${range[2]}` : 'single'}`;
  }

  const bodyLines = leftLines.filter(
    (l) => !/^passage\s+\d+/i.test(l.text.trim()) && l.text.trim() !== '',
  );
  if (bodyLines.length === 0) return null;

  // The attribution credit is the trailing "Adapted from ..." / "From ..." line.
  const attributionIdx = bodyLines.findIndex((l) => /^(adapted\s+from|from)\b/i.test(l.text.trim()));
  const hasAttribution = attributionIdx >= 0;
  const proseLines = hasAttribution ? bodyLines.slice(0, attributionIdx) : bodyLines;
  if (proseLines.length === 0) return null;

  return { setKey, itemsInSet, hasAttribution, proseLines };
}

/**
 * Full single-page extraction: the passage prose plus the one item shown beside it.
 * Returns null when the page did not yield a usable passage.
 */
export function extractPage(imagePath) {
  const words = ocrWords(imagePath);
  if (words.length === 0) return null;
  const pageWidth = Math.max(...words.map((w) => w.left + w.width));
  const { left, right } = splitPanes(words, pageWidth);
  const passage = extractPassage(left);
  const item = extractItem(right);
  return { passage, item };
}
