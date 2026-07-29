/**
 * Types for `extract.mjs`, which stays plain ESM because the profiler runs under bare
 * `node` with no build step. Only the surface the TypeScript callers use is declared.
 */

export declare const MIN_CONFIDENCE: number;

export interface OcrWord {
  block: number;
  par: number;
  line: number;
  left: number;
  top: number;
  width: number;
  text: string;
}

export interface OcrLine {
  key: string;
  block: number;
  par: number;
  top: number;
  left: number;
  words: string[];
  text: string;
}

export interface ExtractedPassage {
  setKey: string | null;
  itemsInSet: number | null;
  hasAttribution: boolean;
  proseLines: OcrLine[];
}

export interface ExtractedItem {
  stem: string;
  options: { label: string; text: string }[];
}

export declare function findImages(root: string, matches?: readonly string[]): string[];
export declare function ocrWords(imagePath: string): OcrWord[];
export declare function toLines(words: readonly OcrWord[]): OcrLine[];
export declare function isChrome(text: string): boolean;
export declare function splitPanes(
  words: readonly OcrWord[],
  pageWidth: number,
): { left: OcrLine[]; right: OcrLine[] };
export declare function extractPassage(leftLines: readonly OcrLine[]): ExtractedPassage | null;
export declare function extractItem(rightLines: readonly OcrLine[]): ExtractedItem;
export declare function extractPage(
  imagePath: string,
): { passage: ExtractedPassage | null; item: ExtractedItem } | null;
