import { describe, expect, it } from 'vitest';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
  LessonItemBindingSchema,
  LessonRuntimeResponseFactsSchema,
  UtcTimestampSchema,
} from '@mcat/contracts';
import { scoreAttempt } from './scoring';
import { findHardPrerequisiteCycle, SkillDefinitionSchema, type SkillGraph } from './skill-graph';
import { advances, baseStateRank } from './mastery';
import { EvidenceRecordSchema, isMasteryEligible } from './evidence';
import { adaptLessonResponse } from './lesson-response-adapter';

const baseEvidence = EvidenceRecordSchema.parse({
  evidenceId: '11111111-1111-4111-8111-111111111111',
  skillId: 'bb1-enzyme-inhibition',
  cluster: 'BB1',
  operation: 'K',
  kind: 'independent',
  independent: true,
  assistanceLevel: 'A0',
  contentBearingHint: false,
  questionId: 'bb1-enzyme-fixture-0001',
  itemVersion: 1,
  familyId: 'fam-enzyme-a',
  changeDimensions: [],
  conditions: { mixed: false, passage: false, timed: false, protected: false, accommodations: [] },
  outcome: 'correct',
  valid: true,
  occurredAt: '2026-07-20T12:00:00.000Z',
  sequence: 1,
  contentRelease: 'synthetic-2026.07',
  policies: [{ policyId: 'mastery', version: 'provisional-v1' }],
});

describe('scoring', () => {
  it('scores correct/incorrect/omitted', () => {
    const ctx = {
      correctChoiceId: 'B',
      assistanceLevel: 'A0' as const,
      contentBearingHint: false,
      isDiagnosticRetry: false,
      revealed: false,
    };
    expect(scoreAttempt({ ...ctx, chosenChoiceId: 'B' }).outcome).toBe('correct');
    expect(scoreAttempt({ ...ctx, chosenChoiceId: 'A' }).outcome).toBe('incorrect');
    expect(scoreAttempt({ ...ctx, chosenChoiceId: null }).outcome).toBe('omitted');
  });

  it('only A0/no-hint/no-retry/no-reveal counts as independent', () => {
    expect(
      scoreAttempt({
        correctChoiceId: 'B',
        chosenChoiceId: 'B',
        assistanceLevel: 'A0',
        contentBearingHint: false,
        isDiagnosticRetry: false,
        revealed: false,
      }).independent,
    ).toBe(true);
    expect(
      scoreAttempt({
        correctChoiceId: 'B',
        chosenChoiceId: 'B',
        assistanceLevel: 'A1',
        contentBearingHint: false,
        isDiagnosticRetry: false,
        revealed: false,
      }).independent,
    ).toBe(false);
    expect(
      scoreAttempt({
        correctChoiceId: 'B',
        chosenChoiceId: 'B',
        assistanceLevel: 'A0',
        contentBearingHint: false,
        isDiagnosticRetry: false,
        revealed: true,
      }).independent,
    ).toBe(false);
  });
});

describe('skill graph', () => {
  const skills = ['a', 'b', 'c'].map((id) =>
    SkillDefinitionSchema.parse({
      skillId: id,
      cluster: 'BB1',
      title: id,
      objective: 'o',
      sections: ['bb'],
      operations: ['K'],
    }),
  );

  it('returns null for an acyclic hard-prerequisite graph', () => {
    const graph: SkillGraph = {
      version: 'v1',
      skills,
      edges: [
        { from: 'a', to: 'b', kind: 'hard_prerequisite' },
        { from: 'b', to: 'c', kind: 'hard_prerequisite' },
      ],
    };
    expect(findHardPrerequisiteCycle(graph)).toBeNull();
  });

  it('detects a hard-prerequisite cycle', () => {
    const graph: SkillGraph = {
      version: 'v1',
      skills,
      edges: [
        { from: 'a', to: 'b', kind: 'hard_prerequisite' },
        { from: 'b', to: 'c', kind: 'hard_prerequisite' },
        { from: 'c', to: 'a', kind: 'hard_prerequisite' },
      ],
    };
    expect(findHardPrerequisiteCycle(graph)).not.toBeNull();
  });

  it('ignores non-hard edges when detecting cycles', () => {
    const graph: SkillGraph = {
      version: 'v1',
      skills,
      edges: [
        { from: 'a', to: 'b', kind: 'confusable_with' },
        { from: 'b', to: 'a', kind: 'confusable_with' },
      ],
    };
    expect(findHardPrerequisiteCycle(graph)).toBeNull();
  });
});

describe('mastery invariants', () => {
  it('accepts opaque lesson item identifiers without requiring an authoring operation tag', () => {
    expect(
      EvidenceRecordSchema.safeParse({
        ...baseEvidence,
        questionId: 'ALG-GRAPH-ENTRY-01',
        stimulusId: 'PROMPT:ALG-GRAPH-ENTRY-01',
        operation: undefined,
      }).success,
    ).toBe(true);
    expect(
      EvidenceRecordSchema.safeParse({
        ...baseEvidence,
        operation: 'EXPLAIN',
      }).success,
    ).toBe(false);
  });

  it('orders base states', () => {
    expect(baseStateRank('strong')).toBeGreaterThan(baseStateRank('independent'));
    expect(advances('learning', 'retained')).toBe(true);
    expect(advances('strong', 'independent')).toBe(false);
  });

  it('never treats contextual-only or assisted evidence as mastery-eligible', () => {
    expect(isMasteryEligible(baseEvidence)).toBe(true);
    expect(isMasteryEligible({ ...baseEvidence, kind: 'simulation' })).toBe(false);
    expect(isMasteryEligible({ ...baseEvidence, kind: 'placement' })).toBe(false);
    expect(isMasteryEligible({ ...baseEvidence, independent: false })).toBe(false);
    expect(isMasteryEligible({ ...baseEvidence, contentBearingHint: true })).toBe(false);
    expect(isMasteryEligible({ ...baseEvidence, valid: false })).toBe(false);
    expect(isMasteryEligible({ ...baseEvidence, outcome: 'incorrect' })).toBe(false);
  });
});

describe('lesson-sourced evidence stays compatible with the existing evidence model', () => {
  const lessonEvidence = (): ReturnType<typeof adaptLessonResponse>['evidence'] =>
    adaptLessonResponse({
      binding: LessonItemBindingSchema.parse({
        measurementKind: 'MEASURABLE',
        lessonId: 'lesson-compat',
        itemBindingId: 'ib-compat',
        questionId: 'q-compat',
        activityId: 'act-compat',
        bindingVersion: 'v-compat',
        primaryKcId: 'bb1-enzyme-inhibition',
        secondaryKcMappings: [],
        activityRole: 'CHANGED_EXIT',
        semanticFamilyId: 'fam-enzyme-a',
        stimulusLineageId: 'lineage-compat',
        firstAttemptImmutable: true,
        authoredAssistanceAffordances: ['A0'],
        candidateEvidenceModes: ['TRANSFER'],
        reasoningOperation: 'EXPLAIN',
        changedDimensions: ['representation', 'domain_context'],
        learnerSafeItemRef: 'REF:compat',
        serverScoringAuthorityRef: 'server://compat',
      }),
      response: LessonRuntimeResponseFactsSchema.parse({
        questionId: 'q-compat',
        itemBindingId: 'ib-compat',
        bindingVersion: 'v-compat',
        attemptIndex: 1,
        isRetry: false,
        isDiagnosticRetry: false,
        response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'B' },
        omitted: false,
        elapsedMs: 20_000,
        answerChanges: 0,
        assistanceLevel: 'A0',
        contentBearingHintUsed: false,
        revealUsed: false,
        occurredAt: '2026-07-20T12:00:00.000Z',
      }),
      scoring: { scoringValid: true, serverItemVersion: 3, outcome: 'correct' },
      identity: {
        observationId: '22222222-2222-4222-8222-222222222221',
        eventId: EventIdSchema.parse('22222222-2222-4222-8222-222222222222'),
        learnerId: LearnerIdSchema.parse('22222222-2222-4222-8222-222222222223'),
        idempotencyKey: IdempotencyKeySchema.parse('22222222-2222-4222-8222-222222222224'),
        evidenceId: '22222222-2222-4222-8222-222222222225',
      },
      cluster: 'BB1',
      envelopeBindingVersion: 'envelope-compat',
      acceptedAt: UtcTimestampSchema.parse('2026-07-20T12:00:01.000Z'),
      sequence: 2,
      contentRelease: 'synthetic-2026.07',
      policies: [{ policyId: 'mastery', version: 'provisional-v1' }],
    }).evidence;

  it('parses under the shipped EvidenceRecord schema with no operation tag', () => {
    const evidence = lessonEvidence();
    expect(evidence).not.toBeNull();
    expect(EvidenceRecordSchema.parse(evidence)).toEqual(evidence);
    expect(evidence && 'operation' in evidence).toBe(false);
  });

  it('keeps the existing family, freshness and mastery-eligibility semantics', () => {
    const evidence = lessonEvidence();
    expect(evidence?.familyId).toBe('fam-enzyme-a');
    expect(evidence?.changeDimensions).toEqual(['representation', 'domain_context']);
    expect(evidence?.kind).toBe('transfer');
    expect(evidence && isMasteryEligible(evidence)).toBe(true);
    expect(evidence && isMasteryEligible({ ...evidence, kind: 'instruction' })).toBe(false);
  });

  it('still accepts a v7 record that carries an OperationTag', () => {
    expect(baseEvidence.operation).toBe('K');
    expect(isMasteryEligible(baseEvidence)).toBe(true);
  });
});
