import { CLUSTER_INFO, type Section, type SkillCluster } from '@mcat/contracts';
import {
  BAYES_DIAGNOSTIC_CONFIG,
  computeBayesResult,
  selectNextBayes,
  type DiagnosticClassification,
  type DiagnosticRecommendation,
  type DiagnosticState,
} from '@mcat/policies';
import type { DiagnosticBank, DiagnosticItemView } from './diagnostic-bank';
import type { ScoredResponse, SessionRecord } from './diagnostic-session-store';

/**
 * Pure orchestration over the balanced-adaptive policy: derive selection state
 * from the event-sourced responses, pick the next item deterministically, and —
 * on completion — compute the diagnostic decision envelope. No I/O, no crypto.
 */

/** Learner-facing priority (no numeric confidence — the plan forbids fake precision). */
export interface PriorityView {
  cluster: SkillCluster;
  title: string;
  tested: string;
  recommendation: DiagnosticRecommendation;
}

export interface ClusterSignalView {
  cluster: SkillCluster;
  title: string;
  section: Section;
  classification: DiagnosticClassification;
  recommendation: DiagnosticRecommendation;
}

/** The result surfaced to the client: recommendations + word label, never a score. */
export interface DiagnosticResultView {
  confidenceLabel: 'High' | 'Medium' | 'Still building';
  topPriorities: PriorityView[];
  stillConfirming: { cluster: SkillCluster; title: string }[];
  perCluster: ClusterSignalView[];
  itemsScored: number;
}

export interface DiagnosticNextView {
  done: boolean;
  progress: number;
  itemsScored: number;
  question: DiagnosticItemView | null;
  result: DiagnosticResultView | null;
}

const seenIds = (record: SessionRecord): Set<string> => {
  const seen = new Set<string>(record.responses.map((r) => r.questionId));
  if (record.pendingItemId) seen.add(record.pendingItemId);
  return seen;
};

/** Rebuild the deterministic selection state from the response log. */
export function deriveState(record: SessionRecord): DiagnosticState {
  const familiesByCluster: Record<string, Set<string>> = {};
  const itemsBySection: Record<Section, number> = { cp: 0, cars: 0, bb: 0, ps: 0 };
  for (const r of record.responses) {
    (familiesByCluster[r.cluster] ??= new Set<string>()).add(r.familyId);
    itemsBySection[r.section] += 1;
  }
  return {
    itemsScored: record.responses.length,
    seenQuestionIds: seenIds(record),
    familiesByCluster: familiesByCluster as DiagnosticState['familiesByCluster'],
    itemsBySection,
    seed: record.seed,
  };
}

/** Score + append one response (event-sourced). Correctness stays server-side. */
export function recordAnswer(
  bank: DiagnosticBank,
  record: SessionRecord,
  questionId: string,
  choiceId: string | null,
  elapsedMs: number,
): void {
  const placement = bank.placement(questionId);
  if (!placement) return;
  const response: ScoredResponse = {
    questionId,
    cluster: placement.cluster,
    section: placement.section,
    familyId: placement.familyId,
    correct: bank.score(questionId, choiceId),
    elapsedMs: Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.min(elapsedMs, 30 * 60 * 1000) : 0,
    seq: record.responses.length,
    ...(placement.dokLevel !== undefined ? { dokLevel: placement.dokLevel } : {}),
  };
  record.responses.push(response);
}

function buildResultView(record: SessionRecord): DiagnosticResultView {
  const result = record.result ?? computeBayesResult(record.responses);
  return {
    confidenceLabel: result.confidenceLabel,
    topPriorities: result.topPriorities.map((p) => ({
      cluster: p.cluster,
      title: p.title,
      tested: CLUSTER_INFO[p.cluster].tested,
      recommendation: p.recommendation,
    })),
    stillConfirming: result.stillConfirming.map((cluster) => ({
      cluster,
      title: CLUSTER_INFO[cluster].title,
    })),
    perCluster: result.perCluster.map((s) => ({
      cluster: s.cluster,
      title: CLUSTER_INFO[s.cluster].title,
      section: s.section,
      classification: s.classification,
      recommendation: s.recommendation,
    })),
    itemsScored: result.itemsScored,
  };
}

const progressDenominator = (bank: DiagnosticBank): number =>
  Math.min(
    BAYES_DIAGNOSTIC_CONFIG.maxItems,
    Math.max(BAYES_DIAGNOSTIC_CONFIG.minItems, Math.min(bank.eligibleCount, BAYES_DIAGNOSTIC_CONFIG.maxItems)),
  );

/**
 * Resolve the next step. If an item is already served-but-unanswered, re-serve it
 * (idempotent resume). Otherwise select the next item; when the policy stops,
 * compute and cache the diagnostic result. Returns the served question id (if any)
 * so the caller can mint a one-use item token.
 */
export function resolveNext(
  bank: DiagnosticBank,
  record: SessionRecord,
): { view: DiagnosticNextView; servedQuestionId: string | null } {
  const denom = progressDenominator(bank);

  if (record.completed) {
    return {
      view: {
        done: true,
        progress: 1,
        itemsScored: record.responses.length,
        question: null,
        result: buildResultView(record),
      },
      servedQuestionId: null,
    };
  }

  const questionId = record.pendingItemId ?? selectPick(bank, record);

  if (questionId === null) {
    record.completed = true;
    record.result = computeBayesResult(record.responses);
    record.pendingItemId = null;
    record.pendingItemTokenHash = null;
    return {
      view: {
        done: true,
        progress: 1,
        itemsScored: record.responses.length,
        question: null,
        result: buildResultView(record),
      },
      servedQuestionId: null,
    };
  }

  const view = bank.view(questionId);
  return {
    view: {
      done: false,
      progress: Math.min(0.98, record.responses.length / denom),
      itemsScored: record.responses.length,
      question: view,
      result: null,
    },
    servedQuestionId: questionId,
  };
}

function selectPick(bank: DiagnosticBank, record: SessionRecord): string | null {
  const selection = selectNextBayes(
    record.responses,
    bank.candidates,
    BAYES_DIAGNOSTIC_CONFIG,
    record.seed,
  );
  return selection.done ? null : (selection.questionId ?? null);
}
