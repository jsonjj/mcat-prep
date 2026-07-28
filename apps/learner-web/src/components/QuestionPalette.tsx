import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import type { BlockQuestion } from '../app/use-block-navigation';

/**
 * Jump-to-question grid for a multistage block. Every cell carries its state in
 * shape as well as colour — answered is a filled cell, flagged adds a corner
 * wedge, current adds a ring — so the grid still reads without colour vision.
 *
 * Navigation is a roving tabindex: the grid is one tab stop and arrows move
 * between cells, which keeps a 20-item block from swallowing 20 tab presses.
 */

export interface QuestionPaletteProps {
  questions: readonly BlockQuestion[];
  currentIndex: number;
  answers: Readonly<Record<string, string>>;
  flagged: ReadonlySet<string>;
  onSelect(index: number): void;
  /** Number printed on the first cell. Later stages continue the running count. */
  startNumber?: number;
  label?: string;
}

export type PaletteKey = 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

const PALETTE_KEYS = new Set<string>([
  'ArrowRight',
  'ArrowLeft',
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
]);

export function paletteCellLabel(cell: {
  number: number;
  answered: boolean;
  flagged: boolean;
  current: boolean;
}): string {
  const parts = [`Question ${cell.number}`, cell.answered ? 'answered' : 'not answered'];
  if (cell.flagged) parts.push('flagged for review');
  if (cell.current) parts.push('current question');
  return parts.join(', ');
}

/** Target index for a navigation key, clamped to the grid. Pure, so it is testable. */
export function nextPaletteIndex(
  from: number,
  key: PaletteKey,
  count: number,
  columns: number,
): number {
  if (count <= 0) return 0;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;

  const cols = Math.max(1, columns);
  const step =
    key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : key === 'ArrowDown' ? cols : -cols;

  const target = from + step;
  // Vertical moves off the edge stay put rather than jumping rows, which is
  // what makes a ragged last row navigable.
  if (target < 0 || target >= count) return from;
  return target;
}

export function QuestionPalette({
  questions,
  currentIndex,
  answers,
  flagged,
  onSelect,
  startNumber = 1,
  label = 'Jump to a question',
}: QuestionPaletteProps) {
  const cellsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(currentIndex);
  const [syncedIndex, setSyncedIndex] = useState(currentIndex);

  // Follow the question the learner is actually on, so tabbing into the grid
  // after using Next/Previous lands on the live cell rather than a stale one.
  let roving = focusIndex;
  if (syncedIndex !== currentIndex) {
    roving = currentIndex;
    setSyncedIndex(currentIndex);
    setFocusIndex(currentIndex);
  }
  roving = Math.min(Math.max(0, roving), Math.max(0, questions.length - 1));

  // The grid wraps on `auto-fill`, so the column count is only knowable from
  // layout: count the leading cells that share the first cell's row.
  const columnCount = useCallback((): number => {
    const cells = cellsRef.current.filter((el): el is HTMLButtonElement => el !== null);
    if (cells.length === 0) return 1;
    const firstTop = cells[0].offsetTop;
    let columns = 0;
    for (const cell of cells) {
      if (cell.offsetTop !== firstTop) break;
      columns += 1;
    }
    return Math.max(1, columns);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!PALETTE_KEYS.has(event.key)) return;
    event.preventDefault();
    const target = nextPaletteIndex(
      roving,
      event.key as PaletteKey,
      questions.length,
      columnCount(),
    );
    setFocusIndex(target);
    cellsRef.current[target]?.focus();
  };

  const answeredCount = questions.reduce(
    (total, q) => (answers[q.questionId] === undefined ? total : total + 1),
    0,
  );

  // A shorter next stage would otherwise leave detached cells in the ref array,
  // and their offsetTop of 0 would corrupt the column count.
  cellsRef.current.length = questions.length;

  return (
    <nav className="mc-diag-palette" aria-label={label}>
      <div className="mc-diag-palette__head">
        <span className="mc-diag-palette__count">
          {answeredCount} of {questions.length} answered
        </span>
        <ul className="mc-diag-palette__legend">
          <li>
            <span
              className="mc-diag-palette__swatch mc-diag-palette__swatch--answered"
              aria-hidden="true"
            />
            Answered
          </li>
          <li>
            <span className="mc-diag-palette__swatch" aria-hidden="true" />
            Not answered
          </li>
          <li>
            <span
              className="mc-diag-palette__swatch mc-diag-palette__swatch--flagged"
              aria-hidden="true"
            />
            Flagged
          </li>
        </ul>
      </div>

      <ul className="mc-diag-palette__grid" onKeyDown={onKeyDown}>
        {questions.map((question, index) => {
          const answered = answers[question.questionId] !== undefined;
          const isFlagged = flagged.has(question.questionId);
          const current = index === currentIndex;
          const classes = [
            'mc-diag-palette__cell',
            answered ? 'mc-diag-palette__cell--answered' : '',
            isFlagged ? 'mc-diag-palette__cell--flagged' : '',
            current ? 'mc-diag-palette__cell--current' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={question.questionId}>
              <button
                type="button"
                ref={(el) => {
                  cellsRef.current[index] = el;
                }}
                className={classes}
                tabIndex={index === roving ? 0 : -1}
                aria-current={current ? 'true' : undefined}
                aria-label={paletteCellLabel({
                  number: startNumber + index,
                  answered,
                  flagged: isFlagged,
                  current,
                })}
                onClick={() => {
                  setFocusIndex(index);
                  onSelect(index);
                }}
                onFocus={() => setFocusIndex(index)}
              >
                <span aria-hidden="true">{startNumber + index}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
