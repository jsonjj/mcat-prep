/**
 * Card HTML sanitization. Imported Anki cards and the WYSIWYG editor both produce
 * HTML that gets stored and later injected via dangerouslySetInnerHTML, so every
 * value passes through DOMPurify first. The media placeholder attribute
 * (`data-recall-media`) is preserved; resolved blob URLs are added at display time.
 */
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span',
  'ul', 'ol', 'li', 'hr', 'sub', 'sup', 'code', 'pre', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'img', 'audio', 'source',
  'h1', 'h2', 'h3', 'h4',
];

const ALLOWED_ATTR = [
  'class', 'style', 'src', 'alt', 'title', 'controls', 'preload',
  'colspan', 'rowspan', 'data-recall-media',
];

export function sanitizeCardHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Stored src is only ever a media placeholder (data-attr) or a safe absolute
    // URL; blob: URLs are injected post-sanitize at display time.
    ALLOWED_URI_REGEXP: /^(?:https?:|data:image\/|blob:|mailto:)/i,
  });
}

/** Strip all markup to plain text (for search indexing / previews). */
export function htmlToText(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\s+/g, ' ')
    .trim();
}
