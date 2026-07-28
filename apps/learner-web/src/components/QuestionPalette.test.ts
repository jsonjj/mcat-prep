import { describe, expect, it } from 'vitest';
import { nextPaletteIndex, paletteCellLabel } from './QuestionPalette';

describe('paletteCellLabel', () => {
  it('always states whether the question is answered', () => {
    expect(paletteCellLabel({ number: 3, answered: false, flagged: false, current: false })).toBe(
      'Question 3, not answered',
    );
    expect(paletteCellLabel({ number: 3, answered: true, flagged: false, current: false })).toBe(
      'Question 3, answered',
    );
  });

  it('announces flags and the current question', () => {
    expect(paletteCellLabel({ number: 12, answered: true, flagged: true, current: false })).toBe(
      'Question 12, answered, flagged for review',
    );
    expect(paletteCellLabel({ number: 12, answered: false, flagged: true, current: true })).toBe(
      'Question 12, not answered, flagged for review, current question',
    );
  });
});

describe('nextPaletteIndex', () => {
  const cols = 10;
  const count = 50;

  it('moves one cell horizontally', () => {
    expect(nextPaletteIndex(4, 'ArrowRight', count, cols)).toBe(5);
    expect(nextPaletteIndex(4, 'ArrowLeft', count, cols)).toBe(3);
  });

  it('moves one row vertically', () => {
    expect(nextPaletteIndex(4, 'ArrowDown', count, cols)).toBe(14);
    expect(nextPaletteIndex(14, 'ArrowUp', count, cols)).toBe(4);
  });

  it('stays put at the edges rather than wrapping', () => {
    expect(nextPaletteIndex(0, 'ArrowLeft', count, cols)).toBe(0);
    expect(nextPaletteIndex(0, 'ArrowUp', count, cols)).toBe(0);
    expect(nextPaletteIndex(49, 'ArrowRight', count, cols)).toBe(49);
    expect(nextPaletteIndex(49, 'ArrowDown', count, cols)).toBe(49);
  });

  it('reaches a ragged last row without overshooting past it', () => {
    expect(nextPaletteIndex(32, 'ArrowDown', 43, cols)).toBe(42);
    expect(nextPaletteIndex(37, 'ArrowDown', 43, cols)).toBe(37);
  });

  it('jumps to the ends', () => {
    expect(nextPaletteIndex(21, 'Home', count, cols)).toBe(0);
    expect(nextPaletteIndex(21, 'End', count, cols)).toBe(49);
  });

  it('survives a degenerate grid', () => {
    expect(nextPaletteIndex(0, 'ArrowDown', 0, cols)).toBe(0);
    expect(nextPaletteIndex(0, 'ArrowDown', 3, 0)).toBe(1);
  });
});
