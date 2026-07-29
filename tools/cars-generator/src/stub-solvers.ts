/**
 * Deterministic offline stand-ins for the solver ensemble.
 *
 * These exist to prove the calibration plumbing — OCR recovery, set grouping, label
 * derivation, permutation, aggregation — without a provider key. They are NOT a
 * substitute for real solvers, and the numbers they produce say nothing about the corpus:
 * each one follows a single surface cue by construction, so its "accuracy" only measures
 * how often that cue coincides with the label.
 *
 * Both stubs decide from option *content*, never from the presented letter, so they are
 * invariant under the rotation the battery applies. A stub that always answered "B" would
 * map to a different original label on every rotation and could never form a consensus,
 * which would exercise the plumbing incorrectly.
 */

import type { AiChat, AiChatRequest, AiChatResult } from '@mcat/ai-gateway';

/**
 * `longest` follows the classic length cue. `hash` picks arbitrarily but deterministically
 * from option text.
 *
 * The pair is chosen so the two stubs *sometimes* coincide. An ensemble of two can only
 * reach a majority when its members agree, so pairing opposed cues — longest against
 * shortest — would leave every item unlabelled and never exercise the measurement path.
 */
type Cue = 'longest' | 'hash';

/** Recovers the presented options from a built solver prompt. */
function parsePresentedOptions(prompt: string): { label: string; text: string }[] {
  const options: { label: string; text: string }[] = [];
  for (const line of prompt.split('\n')) {
    const match = /^([ABCD])\.\s+(.*)$/.exec(line.trim());
    if (match?.[1] && match[2]) options.push({ label: match[1], text: match[2] });
  }
  return options;
}

class StubChat implements AiChat {
  constructor(private readonly cue: Cue) {}

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    const prompt = request.messages.map((m) => m.content).join('\n');
    const options = parsePresentedOptions(prompt);
    if (options.length === 0) return { text: '' };

    const scored = options
      .map((o) => ({
        label: o.label,
        score: this.cue === 'longest' ? o.text.split(/\s+/).length : hash(o.text),
      }))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return { text: scored[0]?.label ?? '' };
  }
}

/** FNV-1a over the option text: stable across runs and independent of presented order. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function stubSolvers(): { id: string; chat: AiChat }[] {
  return [
    { id: 'stub-longest-option', chat: new StubChat('longest') },
    { id: 'stub-content-hash', chat: new StubChat('hash') },
  ];
}
