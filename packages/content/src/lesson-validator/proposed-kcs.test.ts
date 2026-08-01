import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildResolvableIds, lessonOrderedKcIds, planProposedKcs, type LessonKcRefs } from './index';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CATALOG = buildResolvableIds(
  JSON.parse(readFileSync(join(repoRoot, 'curriculum/v3/v3-lesson-authoring-manifest.json'), 'utf8')) as unknown,
).kcIds;

const realLesson = (dirName: string): LessonKcRefs => {
  const script = JSON.parse(
    readFileSync(join(repoRoot, 'content/lessons', dirName, 'lesson-script.json'), 'utf8'),
  ) as unknown;
  return { lessonId: dirName.toUpperCase(), orderedKcIds: lessonOrderedKcIds(script) };
};
const REAL = ['v3-les-130923', 'v3-les-789208', 'v3-les-844372'].map(realLesson);

describe('planProposedKcs — advisory queue mirrors R14 without gating', () => {
  it('extracts each real lesson\u2019s declared KCs (non-empty ordered_kc_ids)', () => {
    for (const l of REAL) expect(l.orderedKcIds.length, `${l.lessonId} has declared KCs`).toBeGreaterThan(0);
  });

  it('the real catalog produces ZERO proposed KCs (every declared KC resolves — matches green R14)', () => {
    const plan = planProposedKcs(REAL, CATALOG, '# Roadmap\n\nexisting content\n');
    expect(plan.proposed).toEqual([]);
    // a "None" managed block is appended once; re-planning the applied text is a no-op (idempotent)
    expect(plan.changed).toBe(true);
    expect(plan.newRoadmapText).toContain('_None');
    const second = planProposedKcs(REAL, CATALOG, plan.newRoadmapText);
    expect(second.changed, 'second run must be idempotent').toBe(false);
    expect(second.newRoadmapText).toBe(plan.newRoadmapText);
  });

  it('surfaces a genuinely-unknown KC (the authoring escape valve), attributed to its lessons', () => {
    const authored: LessonKcRefs[] = [
      { lessonId: 'V3-LES-NEW1', orderedKcIds: ['V3-KC-000000', ...REAL[0]!.orderedKcIds] },
      { lessonId: 'V3-LES-NEW2', orderedKcIds: ['V3-KC-000000', 'V3-KC-999999'] },
    ];
    const plan = planProposedKcs(authored, CATALOG, '# Roadmap\n');
    expect(plan.proposed.map((p) => p.kcId)).toEqual(['V3-KC-000000', 'V3-KC-999999']);
    // shared unknown KC lists BOTH lessons (sorted, de-duplicated); real KCs never appear
    expect(plan.proposed[0]!.lessons).toEqual(['V3-LES-NEW1', 'V3-LES-NEW2']);
    expect(plan.proposed[1]!.lessons).toEqual(['V3-LES-NEW2']);
    expect(plan.newRoadmapText).toContain('`V3-KC-000000` — referenced by: V3-LES-NEW1, V3-LES-NEW2');
  });

  it('reconciles a STALE managed block in place (never duplicates the sentinel)', () => {
    // Seed a roadmap that already has a block claiming a now-resolved proposal.
    const seeded = planProposedKcs(
      [{ lessonId: 'V3-LES-OLD', orderedKcIds: ['V3-KC-000000'] }],
      CATALOG,
      '# Roadmap\n\nkeep me\n',
    ).newRoadmapText;
    expect(seeded).toContain('V3-KC-000000');

    // Re-run once the KC is resolved (real catalog): the block flips to "None", not appended twice.
    const reconciled = planProposedKcs(REAL, CATALOG, seeded);
    expect(reconciled.changed).toBe(true);
    expect(reconciled.newRoadmapText).not.toContain('V3-KC-000000');
    expect(reconciled.newRoadmapText).toContain('_None');
    expect(reconciled.newRoadmapText.match(/PROPOSED_KCS:BEGIN/g)?.length, 'exactly one managed block').toBe(1);
    expect(reconciled.newRoadmapText.startsWith('# Roadmap\n\nkeep me\n')).toBe(true);
  });
});
