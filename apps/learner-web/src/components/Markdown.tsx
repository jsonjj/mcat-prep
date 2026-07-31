import type { ReactNode } from 'react';

/**
 * Minimal, safe Markdown for AI-authored copy (currently the CARS Duel feedback).
 *
 * Supports exactly the subset the reflection prompt emits: `**bold**` inline runs
 * (used for the section headings) and `-`/`*` unordered lists. Everything is emitted
 * as React nodes — never `dangerouslySetInnerHTML` — so any raw HTML in the model
 * output renders as literal, escaped text and injection is impossible. Unsupported
 * syntax degrades gracefully to plain paragraphs.
 *
 * Deliberately tiny (no markdown dependency); widen the grammar only if a real need
 * appears. The repo's other renderer (`CardHtml` + `sanitizeCardHtml`, DOMPurify) is
 * HTML-oriented for imported Anki cards and is not a fit for model markdown.
 */

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

const BULLET = /^[-*]\s+(.*)$/;
const BOLD = /\*\*(.+?)\*\*/g;

function toBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] | null = null;
  const flushList = () => {
    if (list && list.length > 0) blocks.push({ kind: 'ul', items: list });
    list = null;
  };
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      if (!list) list = [];
      list.push(bullet[1] ?? '');
      continue;
    }
    flushList();
    blocks.push({ kind: 'p', text: line });
  }
  flushList();
  return blocks;
}

/** Split a line into text + <strong> runs; unmatched `**` stay literal text. */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  BOLD.lastIndex = 0;
  while ((match = BOLD.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(<strong key={key++}>{match[1]}</strong>);
    last = BOLD.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const blocks = toBlocks(content);
  return (
    <div className={className}>
      {blocks.map((block, i) =>
        block.kind === 'ul' ? (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}
