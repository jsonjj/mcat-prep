/**
 * Proposed-KCs queue (Real Lesson Catalog, Phase 3, Stream 3B) — the ADVISORY
 * counterpart to the merge-gating R14. R14 hard-fails a lesson that declares a KC
 * absent from the curriculum catalog (curriculum/v3/v3-lesson-authoring-manifest.json);
 * this surfaces those same KCs as a queue for ontology adjudication, so an author of a
 * genuinely-new lesson can PROPOSE the KCs it needs instead of being silently blocked.
 *
 * Two invariants:
 *  - NEVER a CI gate — always advisory (the CLI exits 0 regardless).
 *  - PURE (no file IO) — the caller supplies the lessons' declared KCs, the catalog, and the
 *    current roadmap text, and persists `newRoadmapText`. Output is deterministic (no
 *    timestamps), so the managed block always reflects current truth and re-running is a
 *    byte-for-byte no-op. For today's three real lessons every KC resolves ⇒ proposed set empty.
 *
 * Evidence correction: the plan originally had this resolve KC ids against the three FROZEN
 * ontology files (key-docs/MCAT-skills, ontology-adjudication.md, research-evidence-registry.json).
 * Those hold operation vocabulary + schema templates, not the lesson KC namespace (0/10 lesson KC
 * ids resolve there — see run-manifest r14_source_correction). The real KC catalog, which R14
 * already uses, is the in-repo authoring manifest; this resolves against the SAME source so the
 * gate and the queue can never disagree about what "unknown KC" means.
 */

const BEGIN = '<!-- PROPOSED_KCS:BEGIN (auto-managed by `content-cli proposed-kcs --write`; do not edit inside) -->';
const END = '<!-- PROPOSED_KCS:END -->';
const HEADING = '## Proposed KCs (declared by a lesson but absent from the curriculum catalog)';

const asRec = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * A lesson's declared KCs — mirrors rules.ts `orderedKcIds`: canonical
 * `payload.ordered_kc_ids` (present in all three grammars), with the L1-only
 * `payload.registry_binding.ordered_kc_ids` mirror as a fallback.
 */
export function lessonOrderedKcIds(lessonScriptJson: unknown): string[] {
  const payload = asRec(asRec(lessonScriptJson)?.payload);
  const isStr = (x: unknown): x is string => typeof x === 'string';
  const direct = asArray(payload?.ordered_kc_ids).filter(isStr);
  if (direct.length) return direct;
  return asArray(asRec(payload?.registry_binding)?.ordered_kc_ids).filter(isStr);
}

export interface LessonKcRefs {
  readonly lessonId: string;
  readonly orderedKcIds: readonly string[];
}

export interface ProposedKc {
  readonly kcId: string;
  /** Sorted, de-duplicated lesson ids that declare this unresolved KC. */
  readonly lessons: readonly string[];
}

export interface ProposedKcsPlan {
  readonly proposed: readonly ProposedKc[];
  /** The roadmap text with the managed block reconciled (=== input when already current). */
  readonly newRoadmapText: string;
  readonly changed: boolean;
}

function renderBlock(proposed: readonly ProposedKc[]): string {
  const body =
    proposed.length === 0
      ? '_None — every KC declared by a lesson resolves against `curriculum/v3/v3-lesson-authoring-manifest.json`._'
      : proposed.map((p) => `- \`${p.kcId}\` — referenced by: ${p.lessons.join(', ')}`).join('\n');
  return `${BEGIN}\n${HEADING}\n\n${body}\n${END}`;
}

/**
 * Reconcile the proposed-KCs managed block inside the roadmap text. `catalogKcIds` is the
 * curriculum `kc_by_id` key set; any declared KC not in it is "proposed". Replaces an existing
 * managed block in place (matched by its BEGIN/END sentinels), else appends one. Deterministic
 * and idempotent: applying the plan and re-planning yields `changed: false`.
 */
export function planProposedKcs(
  lessons: readonly LessonKcRefs[],
  catalogKcIds: ReadonlySet<string>,
  existingRoadmapText: string,
): ProposedKcsPlan {
  const byKc = new Map<string, Set<string>>();
  for (const lesson of lessons) {
    for (const kc of new Set(lesson.orderedKcIds)) {
      if (!catalogKcIds.has(kc)) {
        const set = byKc.get(kc) ?? new Set<string>();
        set.add(lesson.lessonId);
        byKc.set(kc, set);
      }
    }
  }
  const proposed: ProposedKc[] = [...byKc.entries()]
    .map(([kcId, lessonSet]) => ({ kcId, lessons: [...lessonSet].sort() }))
    .sort((a, b) => a.kcId.localeCompare(b.kcId));

  const block = renderBlock(proposed);
  const start = existingRoadmapText.indexOf(BEGIN);
  const endIdx = existingRoadmapText.indexOf(END);
  let newRoadmapText: string;
  if (start !== -1 && endIdx > start) {
    newRoadmapText = existingRoadmapText.slice(0, start) + block + existingRoadmapText.slice(endIdx + END.length);
  } else {
    const sep = existingRoadmapText.length === 0 ? '' : existingRoadmapText.endsWith('\n') ? '\n' : '\n\n';
    newRoadmapText = `${existingRoadmapText}${sep}${block}\n`;
  }
  return { proposed, newRoadmapText, changed: newRoadmapText !== existingRoadmapText };
}
