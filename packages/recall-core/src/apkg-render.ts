/**
 * Pure Anki → card rendering (no unzip / no SQLite — the browser adapter reads the
 * `.apkg` and feeds parsed structures here). Supports the common legacy (schema
 * v11) cases: standard note types (incl. reversed via multiple templates), cloze
 * note types, `{{Field}}` / `{{FrontSide}}` substitution, `{{#Field}}` / `{{^Field}}`
 * conditionals, and `[sound:...]` → `<audio>` rewriting. Media `src` values are left
 * as original filenames for the adapter to rewrite to blob URLs.
 *
 * Out of scope (v1): advanced template features (LaTeX/MathJax, TTS, nested
 * conditionals, `{{type:...}}` input). Documented in MCAT_RECALL_FLASHCARDS_PLAN §5.
 */
import type { CardType } from './card';

export interface AnkiField {
  name: string;
  ord: number;
}

export interface AnkiTemplate {
  ord: number;
  name: string;
  qfmt: string;
  afmt: string;
}

export interface AnkiModel {
  id: string;
  name: string;
  /** 0 = standard, 1 = cloze (Anki `col.models[*].type`). */
  type: number;
  flds: AnkiField[];
  tmpls: AnkiTemplate[];
}

export interface AnkiNoteInput {
  id: string;
  mid: string;
  /** Field values, positional (Anki splits `notes.flds` on 0x1f). */
  fields: string[];
  tags: string[];
}

export interface AnkiCardInput {
  id: string;
  nid: string;
  /** Template index (standard) or cloze number − 1 (cloze). */
  ord: number;
  /** Anki deck name (converted to a tag, preserving `Parent::Child`). */
  deckName?: string;
}

export interface RenderedCard {
  type: CardType;
  ord: number;
  frontHtml: string;
  backHtml: string;
  tags: string[];
  /** Original media filenames referenced by this card (for adapter rewrite). */
  mediaFilenames: string[];
}

function fieldMap(model: AnkiModel, note: AnkiNoteInput): Record<string, string> {
  const map: Record<string, string> = {};
  const ordered = [...model.flds].sort((a, b) => a.ord - b.ord);
  ordered.forEach((field, index) => {
    map[field.name] = note.fields[index] ?? '';
  });
  return map;
}

function firstFieldName(model: AnkiModel): string {
  const sorted = [...model.flds].sort((a, b) => a.ord - b.ord);
  return sorted[0]?.name ?? 'Text';
}

/** Resolve `{{#Field}}…{{/Field}}` and `{{^Field}}…{{/Field}}` conditionals. */
function applySections(template: string, fields: Record<string, string>): string {
  const section = /\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/;
  let out = template;
  for (let guard = 0; guard < 200; guard += 1) {
    const match = section.exec(out);
    if (match === null) break;
    const sigil = match[1] ?? '#';
    const name = (match[2] ?? '').trim();
    const inner = match[3] ?? '';
    const value = (fields[name] ?? '').trim();
    const keep = sigil === '#' ? value !== '' : value === '';
    out = out.slice(0, match.index) + (keep ? inner : '') + out.slice(match.index + match[0].length);
  }
  return out;
}

/** Replace `{{Field}}` / `{{FrontSide}}` (modifiers like `type:`/`hint:` are stripped). */
function applyFields(
  template: string,
  fields: Record<string, string>,
  frontSide?: string,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_full: string, raw: string) => {
    const token = raw.trim();
    if (token === 'FrontSide') return frontSide ?? '';
    const name = token.includes(':') ? token.slice(token.lastIndexOf(':') + 1).trim() : token;
    return fields[name] ?? '';
  });
}

/** The cloze field referenced by a `{{cloze:Field}}` token, if any. */
function clozeFieldFrom(qfmt: string): string | null {
  const match = qfmt.match(/\{\{cloze:([^}]+)\}\}/i);
  return match && match[1] ? match[1].trim() : null;
}

function replaceClozeToken(template: string, rendered: string): string {
  return template.replace(/\{\{cloze:[^}]+\}\}/gi, () => rendered);
}

/** Cloze numbers present in a text field, ascending (e.g. c1, c2 → [1, 2]). */
export function clozeNumbersIn(text: string): number[] {
  const nums = new Set<number>();
  for (const match of text.matchAll(/\{\{c(\d+)::/g)) {
    const group = match[1];
    if (group) nums.add(Number(group));
  }
  return [...nums].sort((a, b) => a - b);
}

/**
 * Render one cloze face. The active cloze number is blanked on the front (showing
 * its hint if present) and revealed on the back; all other clozes show their text.
 */
export function renderCloze(text: string, activeClozeNumber: number, reveal: boolean): string {
  return text.replace(
    /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g,
    (_full: string, num: string, answer: string, hint?: string) => {
      if (Number(num) !== activeClozeNumber) return answer;
      if (reveal) return `<span class="mc-cloze mc-cloze--active">${answer}</span>`;
      const label = hint && hint.trim() ? hint.trim() : '...';
      return `<span class="mc-cloze mc-cloze--blank">[${label}]</span>`;
    },
  );
}

/** Rewrite Anki `[sound:file]` markers into HTML audio players (keeps original filename). */
export function rewriteSoundTags(html: string): string {
  return html.replace(
    /\[sound:([^\]]+)\]/gi,
    (_full: string, file: string) =>
      `<audio controls preload="none" src="${file.trim()}"></audio>`,
  );
}

/** Original media filenames referenced by rendered HTML (img/audio/source + sound tags). */
export function extractMediaFilenames(html: string): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/<(?:img|audio|source)\b[^>]*?\ssrc=["']([^"']+)["']/gi)) {
    if (match[1]) names.add(decodeURIComponent(match[1]));
  }
  for (const match of html.matchAll(/\[sound:([^\]]+)\]/gi)) {
    if (match[1]) names.add(match[1].trim());
  }
  return [...names];
}

/** Render a single Anki card (one template face, or one cloze number) to HTML. */
export function renderAnkiCard(
  model: AnkiModel,
  note: AnkiNoteInput,
  card: AnkiCardInput,
): RenderedCard {
  const fields = fieldMap(model, note);
  const tags = [...note.tags, ...(card.deckName ? [card.deckName] : [])];
  const isCloze = model.type === 1;

  let front: string;
  let back: string;

  if (isCloze) {
    const clozeNumber = card.ord + 1;
    const tmpl = model.tmpls[0];
    const qfmt = tmpl?.qfmt ?? '{{cloze:Text}}';
    const afmt = tmpl?.afmt ?? '{{cloze:Text}}<br>{{Extra}}';
    const clozeFieldName = clozeFieldFrom(qfmt) ?? firstFieldName(model);
    const rawText = fields[clozeFieldName] ?? '';
    const frontCloze = renderCloze(rawText, clozeNumber, false);
    const backCloze = renderCloze(rawText, clozeNumber, true);
    front = rewriteSoundTags(applyFields(applySections(replaceClozeToken(qfmt, frontCloze), fields), fields));
    back = rewriteSoundTags(
      applyFields(applySections(replaceClozeToken(afmt, backCloze), fields), fields, front),
    );
  } else {
    const tmpl = model.tmpls[card.ord] ?? model.tmpls[0];
    const qfmt = tmpl?.qfmt ?? '{{Front}}';
    const afmt = tmpl?.afmt ?? '{{FrontSide}}<hr>{{Back}}';
    front = rewriteSoundTags(applyFields(applySections(qfmt, fields), fields));
    back = rewriteSoundTags(applyFields(applySections(afmt, fields), fields, front));
  }

  const mediaFilenames = [
    ...new Set([...extractMediaFilenames(front), ...extractMediaFilenames(back)]),
  ];

  return {
    type: isCloze ? 'cloze' : 'basic',
    ord: card.ord,
    frontHtml: front,
    backHtml: back,
    tags,
    mediaFilenames,
  };
}
