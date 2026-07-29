import type { EvidenceReasonCode, MasteryMapEntry } from '@mcat/contracts';

/**
 * Learner-facing wording for the evidence WARRANT — what the evidence on file
 * covers, and the next piece that is missing. None of it states a capability
 * level: the mastery claim is BKT's `P(L)` (the percentage and `mastered` on the
 * Skills and Progress screens) and comes from nowhere else.
 *
 * The selector is the reason-code set and never an ordinal tier. Both warrant
 * surfaces — `SkillDetail` and the `Study` session summary — read this one
 * function, so a single warrant cannot be worded two different ways.
 *
 * `role` sorts the backend codes by what the UI does with each one. `status` is
 * the single summary of what is on file, `gap` names one concrete missing piece,
 * and `freshness` is already carried by the `refreshNeeded` flag, so it needs no
 * per-code wording — it is worded once, as `EVIDENCE_REFRESH_LABEL`. The record
 * is exhaustive on purpose: a code added to `EVIDENCE_REASON_CODES` fails the
 * build here until someone words it, rather than silently disappearing from the
 * learner's view.
 */
type WarrantPhrase = { role: 'status' | 'gap'; text: string } | { role: 'freshness' };

const NO_EVIDENCE_TEXT = 'No evidence on file yet.';

/**
 * The badge for a stale WARRANT (`refreshNeeded`): the evidence on file has aged
 * out, been contradicted by a fresh failure, or been invalidated by a
 * correction. It says nothing about capability.
 *
 * It must not read as BKT's review-due prompt, which is a different authority
 * answering a different question — "this memory has decayed below the review
 * line" — and is worded "Review due" on the Progress rail. Both were "Needs
 * refresh" until 2026-07-29, so a learner seeing either badge could not tell
 * which claim was being made, and neither could a developer reading the JSX.
 * Every warrant surface reads this constant so the two cannot re-converge by
 * one screen being edited alone.
 */
export const EVIDENCE_REFRESH_LABEL = 'Evidence needs refreshing';

const WARRANT_PHRASE: Record<EvidenceReasonCode, WarrantPhrase> = {
  NO_USEFUL_EVIDENCE: { role: 'status', text: NO_EVIDENCE_TEXT },
  PREREQUISITE_BLOCKED: { role: 'status', text: 'A prerequisite comes first.' },
  INSTRUCTIONAL_EVIDENCE_ONLY: { role: 'status', text: 'Guided work only so far.' },
  INDEPENDENT_EVIDENCE_SATISFIED: { role: 'status', text: 'You have unassisted evidence.' },
  RETENTION_EVIDENCE_SATISFIED: {
    role: 'status',
    text: 'You have unassisted evidence that held up after a delay.',
  },
  STRONG_CONDITIONS_EVIDENCE_SATISFIED: {
    role: 'status',
    text: 'You have evidence across varied conditions.',
  },
  EVIDENCE_STALE: { role: 'freshness' },
  FRESH_FAILURE: { role: 'freshness' },
  CORRECTION_INVALIDATED_EVIDENCE: { role: 'freshness' },
  INDEPENDENT_EVIDENCE_GAP: { role: 'gap', text: 'unassisted practice' },
  TRANSFER_EVIDENCE_GAP: { role: 'gap', text: 'transfer to a changed question' },
  DELAYED_EVIDENCE_GAP: { role: 'gap', text: 'delayed recall' },
  MIXED_EVIDENCE_GAP: { role: 'gap', text: 'mixed practice' },
  PASSAGE_EVIDENCE_GAP: { role: 'gap', text: 'passage work' },
  TIMED_EVIDENCE_GAP: { role: 'gap', text: 'timed work' },
  PROTECTED_EVIDENCE_GAP: { role: 'gap', text: 'an unseen protected check' },
  EVIDENCE_GAP: { role: 'gap', text: 'more evidence' },
};

export interface EvidenceWarrant {
  /** What the evidence already covers. */
  status: string;
  /**
   * The next missing piece, or null when the warrant is complete. Only the first
   * gap is surfaced: the policy's recipe slots arrive in the order a learner earns
   * them, so the first open slot is the actionable one, and listing all seven at
   * once would bury it.
   */
  nextGap: string | null;
}

/** Turn one skill's warrant reason codes into a short, concrete sentence. */
export function evidenceWarrant(reasons: MasteryMapEntry['reasons']): EvidenceWarrant {
  let status: string | null = null;
  let nextGap: string | null = null;
  for (const reason of reasons) {
    const phrase = WARRANT_PHRASE[reason.code];
    if (phrase.role === 'status') status ??= phrase.text;
    else if (phrase.role === 'gap') nextGap ??= phrase.text;
  }
  return { status: status ?? NO_EVIDENCE_TEXT, nextGap };
}
