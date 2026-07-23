import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compileCanonicalLessonBinding,
  parseCanonicalLessonAuthoringManifest,
  validateCanonicalLessonBinding,
} from './canonical-manifest';

const manifestInput = JSON.parse(
  readFileSync(
    new URL('../../../curriculum/v3/v3-lesson-authoring-manifest.json', import.meta.url),
    'utf8',
  ),
) as unknown;

describe('canonical V3 authoring manifest compiler', () => {
  it('parses the frozen 114-lesson / 422-KC manifest and exact release pins', () => {
    const manifest = parseCanonicalLessonAuthoringManifest(manifestInput);

    expect(manifest.curriculum.lessons).toHaveLength(114);
    expect(manifest.curriculum.kcs).toHaveLength(422);
    expect(manifest.metadata.registry.artifact_id).toBe(
      'MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01',
    );
    expect(manifest.metadata.registry.sha256).toBe(
      '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a',
    );
  });

  it('compiles exact lesson, grouping, ordered KC, scope, graph, and sequence bindings', () => {
    const binding = compileCanonicalLessonBinding(manifestInput, 'V3-LES-006619');

    expect(binding.mode).toBe('canonical');
    expect(binding.lesson.groupingId).toBe('V3-CL-006619');
    expect(binding.lesson.orderedKcIds).toEqual(['V3-KC-187351', 'V3-KC-010372', 'V3-KC-376473']);
    expect(binding.kcs.map((kc) => kc.statementOfCompetence)).not.toContain('');
    expect(binding.graphEdgeIds.length).toBeGreaterThan(0);
    expect(binding.sequenceRelationIds).toContain('R14-INTERNAL-006619');
    expect(validateCanonicalLessonBinding(binding, manifestInput)).toEqual([]);
  });

  it('rejects hand-copied manifest drift in canonical statements and scope', () => {
    const binding = compileCanonicalLessonBinding(manifestInput, 'V3-LES-006619');
    const drifted = structuredClone(binding);
    drifted.kcs[0]!.statementOfCompetence = 'Hand-copied reinterpretation.';
    drifted.kcs[0]!.scopeIn = ['Broader than the frozen registry.'];

    expect(validateCanonicalLessonBinding(drifted, manifestInput)).toEqual([
      'lesson registry binding does not exactly match the compiled canonical manifest projection',
    ]);
  });

  it('compiles held attachments as governance-only and rejects required activation', () => {
    const binding = compileCanonicalLessonBinding(manifestInput, 'V3-LES-078488');
    const held = binding.attachments.filter((attachment) =>
      ['V3-EXT-703019', 'V3-CAP-537139'].includes(attachment.id),
    );

    expect(held).toHaveLength(2);
    expect(held.every((attachment) => attachment.activation === 'governance_only')).toBe(true);

    const drifted = structuredClone(binding);
    drifted.attachments.find((attachment) => attachment.id === 'V3-CAP-537139')!.activation =
      'required_separate';
    expect(validateCanonicalLessonBinding(drifted, manifestInput)).not.toEqual([]);
  });
});
