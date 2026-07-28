import { describe, expect, it } from 'vitest';
import {
  EvidenceKindSchema as ContractsEvidenceKindSchema,
  EVIDENCE_REASON_CODES,
  PlannerReasonSchema,
  TaskViewSchema,
  TodayViewSchema,
} from '../../packages/contracts/src/learner-views';
import {
  AcceptedLessonObservationSchema,
  LessonItemBindingSchema,
} from '../../packages/contracts/src/lesson-observation';
import {
  ChangeDimensionSchema,
  EvidenceKindSchema as DomainEvidenceKindSchema,
  EvidenceOutcomeSchema,
} from '../../packages/domain/src/evidence';
import { EVIDENCE_REASONS, PLANNER_REASONS } from '../../packages/domain/src/reason-codes';
import {
  CapacityLabelSchema,
  StudyWindowSchema,
  TaskStatusSchema,
  TaskTypeSchema,
} from '../../packages/domain/src/tasks';

/**
 * Cross-package enum parity: @mcat/contracts re-declares several member lists
 * that @mcat/domain also declares, and nothing in the build detects them
 * drifting apart.
 *
 * The duplication is forced, not sloppy. `packages/domain/package.json`
 * declares `"@mcat/contracts": "workspace:*"`, so the dependency runs
 * domain → contracts; contracts importing domain would be a cycle. Domain is
 * therefore the source of truth and contracts holds a hand-maintained copy.
 *
 * The failure mode is silent: domain gains a member, the contracts copy keeps
 * validating against the stale list, and the wire boundary starts rejecting
 * records the domain legitimately emits (or the lesson adapter emits records
 * domain rejects). Tests here may import both packages, so this is the only
 * layer that can see both lists at once.
 *
 * ORDER IS NOT ASSERTED. Nothing in either package derives meaning from
 * declaration order — no index arithmetic, no ordinal persistence — and no
 * comment documents the copies as being kept in lock order. The contract these
 * mirrors are documented against (see `reason-codes.ts`) is "member-for-member
 * identical", so members are compared as sets.
 */

/** A sentinel no real member may equal, used to make a schema report its options. */
const PROBE_SENTINEL = '__cross-package-enum-parity-probe__';

/**
 * The shape of a Zod issue this file relies on, declared structurally so the
 * test does not need `zod` as a dependency of its own — the schemas it imports
 * already carry the real types.
 */
interface ParseIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly options?: readonly unknown[] | undefined;
}

interface ProbableSchema {
  safeParse(input: unknown): {
    readonly success: boolean;
    readonly error?: { readonly issues: readonly ParseIssue[] } | undefined;
  };
}

/**
 * Reads the member list a schema actually enforces at `path` by feeding it
 * `PROBE_SENTINEL` and reading the options back off the resulting issue.
 *
 * Two of the mirrored enums are module-private in contracts. Exporting them
 * purely so a test could import them would widen the package's public surface
 * for a test's convenience, so this reads the effective list instead: an
 * invalid-enum issue carries the accepted values, which is the same list the
 * schema rejects against in production. `input` only has to reach the field —
 * unrelated issues from an incomplete object are ignored.
 */
function probeEnumMembers(
  label: string,
  schema: ProbableSchema,
  input: unknown,
  path: readonly (string | number)[],
): readonly string[] {
  const result = schema.safeParse(input);
  if (result.success || !result.error) {
    throw new Error(
      `${label}: the parity probe was ACCEPTED at ${JSON.stringify(path)}. The schema no longer ` +
        `rejects unknown members there, so this guard cannot see the member list. Fix the probe.`,
    );
  }
  const target = JSON.stringify(path);
  const matches = result.error.issues.filter(
    (issue) => issue.code === 'invalid_enum_value' && JSON.stringify(issue.path) === target,
  );
  const options = matches.length === 1 ? matches[0]?.options : undefined;
  if (!options || !options.every((option) => typeof option === 'string')) {
    throw new Error(
      `${label}: expected exactly one invalid_enum_value issue carrying string options at ` +
        `${target}, found ${matches.length}. The schema shape moved; update the probe path. ` +
        `Issues seen: ${JSON.stringify(result.error.issues.map((issue) => [issue.path, issue.code]))}`,
    );
  }
  return options;
}

interface MirroredEnum {
  /** What the enum means, for the test name. */
  readonly name: string;
  /** The declaration in @mcat/domain, which is authoritative. */
  readonly source: string;
  /** The hand-maintained copy in @mcat/contracts. */
  readonly mirror: string;
  readonly domainMembers: () => readonly string[];
  readonly contractsMembers: () => readonly string[];
}

/**
 * `EVIDENCE_QUALITY_TIERS` is deliberately absent from this list. It is an
 * ordinal evidence-warrant rank, and it has no contracts-side mirror to keep
 * honest: it stays behind the private `Authority.skillWarrants`, where the
 * planner may legitimately compare tiers, and never crosses the learner-facing
 * wire. BKT's `pL` / `mastered` is the only capability claim a learner sees.
 *
 * `MasteryStateSchema` in contracts/vocab.ts is NOT that mirror — it carries a
 * seventh member, `exam_ready_now`, so asserting parity against it would fail.
 * If a tier ever needs to cross the wire again, add the entry back rather than
 * relaxing the comparison.
 */
const MIRRORED_ENUMS: readonly MirroredEnum[] = [
  {
    name: 'change dimension',
    source: 'packages/domain/src/evidence.ts (ChangeDimensionSchema)',
    mirror: 'packages/contracts/src/lesson-observation.ts (private ChangeDimensionSchema)',
    domainMembers: () => ChangeDimensionSchema.options,
    contractsMembers: () =>
      probeEnumMembers(
        'contracts change dimension',
        LessonItemBindingSchema,
        { measurementKind: 'MEASURABLE', changedDimensions: [PROBE_SENTINEL] },
        ['changedDimensions', 0],
      ),
  },
  {
    name: 'evidence outcome',
    source: 'packages/domain/src/evidence.ts (EvidenceOutcomeSchema)',
    mirror: 'packages/contracts/src/lesson-observation.ts (private EvidenceOutcomeSchema)',
    domainMembers: () => EvidenceOutcomeSchema.options,
    contractsMembers: () =>
      probeEnumMembers(
        'contracts evidence outcome',
        AcceptedLessonObservationSchema,
        { outcome: PROBE_SENTINEL },
        ['outcome'],
      ),
  },
  {
    name: 'evidence kind',
    source: 'packages/domain/src/evidence.ts (EvidenceKindSchema)',
    mirror: 'packages/contracts/src/learner-views.ts (EvidenceKindSchema)',
    domainMembers: () => DomainEvidenceKindSchema.options,
    contractsMembers: () => ContractsEvidenceKindSchema.options,
  },
  {
    name: 'evidence reason code',
    source: 'packages/domain/src/reason-codes.ts (EVIDENCE_REASONS)',
    mirror: 'packages/contracts/src/learner-views.ts (EVIDENCE_REASON_CODES)',
    domainMembers: () => EVIDENCE_REASONS,
    contractsMembers: () => EVIDENCE_REASON_CODES,
  },
  {
    name: 'planner reason',
    source: 'packages/domain/src/reason-codes.ts (PLANNER_REASONS)',
    mirror: 'packages/contracts/src/learner-views.ts (PlannerReasonSchema)',
    domainMembers: () => PLANNER_REASONS,
    contractsMembers: () => PlannerReasonSchema.options,
  },
  {
    name: 'task type',
    source: 'packages/domain/src/tasks.ts (TaskTypeSchema)',
    mirror: 'packages/contracts/src/learner-views.ts (inline enum on TaskViewSchema.type)',
    domainMembers: () => TaskTypeSchema.options,
    contractsMembers: () =>
      probeEnumMembers('contracts task type', TaskViewSchema, { type: PROBE_SENTINEL }, ['type']),
  },
  {
    name: 'task status',
    source: 'packages/domain/src/tasks.ts (TaskStatusSchema)',
    mirror: 'packages/contracts/src/learner-views.ts (inline enum on TaskViewSchema.status)',
    domainMembers: () => TaskStatusSchema.options,
    contractsMembers: () =>
      probeEnumMembers('contracts task status', TaskViewSchema, { status: PROBE_SENTINEL }, [
        'status',
      ]),
  },
  {
    name: 'study window',
    source: 'packages/domain/src/tasks.ts (StudyWindowSchema)',
    mirror: 'packages/contracts/src/learner-views.ts (inline enum on TaskViewSchema.window)',
    domainMembers: () => StudyWindowSchema.options,
    contractsMembers: () =>
      probeEnumMembers('contracts study window', TaskViewSchema, { window: PROBE_SENTINEL }, [
        'window',
      ]),
  },
  {
    name: 'capacity label',
    source: 'packages/domain/src/tasks.ts (CapacityLabelSchema)',
    mirror:
      'packages/contracts/src/learner-views.ts (inline enum on TodayViewSchema.capacityLabel)',
    domainMembers: () => CapacityLabelSchema.options,
    contractsMembers: () =>
      probeEnumMembers(
        'contracts capacity label',
        TodayViewSchema,
        { capacityLabel: PROBE_SENTINEL },
        ['capacityLabel'],
      ),
  },
];

function divergenceReport(
  mirror: MirroredEnum,
  domainMembers: readonly string[],
  contractsMembers: readonly string[],
): string {
  const inDomain = new Set(domainMembers);
  const inContracts = new Set(contractsMembers);
  const missing = domainMembers.filter((member) => !inContracts.has(member));
  const extra = contractsMembers.filter((member) => !inDomain.has(member));

  return [
    `The ${mirror.name} enum has DIVERGED between @mcat/domain and @mcat/contracts.`,
    `  source of truth: ${mirror.source}`,
    `  stale mirror:    ${mirror.mirror}`,
    missing.length > 0
      ? `  in domain but MISSING from the contracts mirror: ${missing.join(', ')}`
      : '  nothing is missing from the contracts mirror',
    extra.length > 0
      ? `  in the contracts mirror but ABSENT from domain: ${extra.join(', ')}`
      : '  the contracts mirror has no extra members',
    '',
    `FIX: edit the mirror in ${mirror.mirror.split(' (')[0]} so its members match`,
    `${mirror.source.split(' (')[0]} exactly. Do not "fix" this by editing domain to match`,
    'contracts, and do not delete this assertion.',
    '',
    'WHY THE DUPLICATE EXISTS: packages/domain/package.json declares',
    '"@mcat/contracts": "workspace:*", so domain depends on contracts. Contracts cannot',
    'import from domain — that would be a dependency cycle — so the member list is copied',
    'by hand and this test is the only thing keeping the two copies honest. A divergence',
    'means one package validates against a member list the other does not accept, which',
    'surfaces at runtime as a rejected-but-legitimate record at the package seam.',
    '',
    'Members are compared as SETS: declaration order is deliberately not part of this',
    'contract.',
  ].join('\n');
}

describe('cross-package enum parity (@mcat/domain ↔ @mcat/contracts)', () => {
  for (const mirror of MIRRORED_ENUMS) {
    it(`${mirror.name} is member-for-member identical in both packages`, () => {
      const domainMembers = mirror.domainMembers();
      const contractsMembers = mirror.contractsMembers();

      // Without these, a probe or export that silently started returning
      // nothing would make the comparison below pass vacuously.
      expect(domainMembers.length, `${mirror.source} yielded no members`).toBeGreaterThan(0);
      expect(contractsMembers.length, `${mirror.mirror} yielded no members`).toBeGreaterThan(0);
      expect(domainMembers, `${mirror.source} contains a duplicate member`).toHaveLength(
        new Set(domainMembers).size,
      );

      expect(
        [...contractsMembers].sort(),
        divergenceReport(mirror, domainMembers, contractsMembers),
      ).toEqual([...domainMembers].sort());
    });
  }

  it('reads the same members by probe as by direct export, so the probe is trustworthy', () => {
    // Two of the mirrors above are only readable by probe. This calibrates that
    // technique against an enum whose members can also be read directly: if the
    // probe ever stops reporting real accepted values, this fails first and
    // says so, rather than the parity tests failing for an unrelated reason.
    const probed = probeEnumMembers(
      'probe calibration',
      ContractsEvidenceKindSchema,
      PROBE_SENTINEL,
      [],
    );
    expect(probed).toEqual([...ContractsEvidenceKindSchema.options]);
    expect(probed.length).toBeGreaterThan(1);
    expect(probed).not.toContain(PROBE_SENTINEL);
  });
});
