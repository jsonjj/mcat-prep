# V3 lesson-authoring bootstrap

This directory provides a checked-in, architecture-only bootstrap for lesson authors who cannot
access the local V3 team package. It is a deterministic projection of the pinned V3 registry, not
an independent curriculum authority.

## Provenance and release pin

- Authoritative package registry: `curriculum-architecture-v3/work/v3-authoritative-registry.json`
- Registry artifact ID: `MCAT-V3-AUTHORITATIVE-REGISTRY-2026-07-22-01`
- Registry SHA-256: `635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a`
- Phase 0 freeze: `MCAT-V3-PHASE0-FRZ-2026-07-22-01`
- Canonical freeze: `MCAT-V3-CANONICAL-FRZ-2026-07-22-01`
- Graph freeze: `MCAT-V3-GRAPH-FRZ-2026-07-22-01`
- Sequence freeze: `MCAT-V3-SEQUENCE-FRZ-2026-07-22-01`
- Phase 1 gate: `MCAT-V3-PHASE1-GATE-2026-07-22-01`
- Canonical runtime and authoring contract:
  `docs/design/mcat-complete-learning-flow.md` (version 0.2, SHA-256
  `e56590830462987e2cc9ec8d523a702e75c903613020addb81da6edbcad3286b`)

The manifest's `metadata.source_files` records the exact schema version and recomputed SHA-256 for
every registry/generated input. Author-machine paths from the source package are not carried into
the bootstrap. `metadata.package_completion` exports the final package state (`complete`), its empty
blocker list, and its 63/63 validation result. Earlier `source_stage_*`, owner-stage, and publication
workflow labels are omitted because they predate that completion state.

## Generate

From the repository root:

```sh
node scripts/generate-v3-lesson-authoring-manifest.mjs \
  /path/to/curriculum-architecture-v3 \
  curriculum/v3/v3-lesson-authoring-manifest.json
```

The generator accepts only the package directory and output path. It derives the canonical contract
path from the repository, contains no user-home path, and writes no timestamp. It fails before
writing if a required file, pinned hash, schema, freeze, count, canonical ID, allowlisted source
field, ownership/order contract, attachment delivery state, capstone placement, repair coordinate,
graph endpoint, or sequence target differs. A recursive pre-write scan rejects protected field
names, stale source-stage fields, and generic POSIX, home-expanded, Windows, UNC, and file-URI
machine paths in every emitted string while allowing ordinary prose and HTTP(S) URLs. Existing
source aliases are checked by real path and inode, and the manifest is installed with a
same-directory atomic rename.

Focused hardening checks use Node's built-in test runner:

```sh
node --test scripts/generate-v3-lesson-authoring-manifest.test.mjs
```

## Cloud authoring orchestration

The deterministic one-lesson-per-agent plan is generated from this checked manifest:

```sh
node scripts/generate-v3-cloud-authoring-plan.mjs
node scripts/generate-v3-cloud-authoring-plan.mjs --check
node --test scripts/generate-v3-cloud-authoring-plan.test.mjs
```

- `v3-cloud-authoring-jobs.json` contains all 114 jobs, exact KC microcycles, relation-backed inputs,
  acceptance gates, role-separation slots, and the fixed 11-wave schedule.
- `v3-cloud-authoring-runbook.md` defines clean-room inputs, the lesson contract, independent review
  pipeline, integration checkpoints, publication boundary, and unresolved launch constraints.

Do not hand-edit the generated job manifest. Its five prototype jobs are an internal port pilot, not
production lesson definitions; all generated content remains internal draft until the runbook's
rights, scientific review, reviewed-hash, and efficacy gates pass.

## Included

`v3-lesson-authoring-manifest.json` contains:

- All 114 canonical CORE lesson shells, all 422 ordered canonical KCs, all 114 canonical groupings,
  and the one explicitly noncanonical/non-mastery diagnostic grouping view.
- All 53 extensions, 43 capstones, and 11 host-attached support artifacts with an explicit
  `delivery_state`. The frozen sequence resolves these as 52 active `host_only` extensions, 42
  `required` capstones, 11 `host_only` supports, and the two held records as `governance_only`.
  `nonrequired` remains a fail-closed enum member but has zero records in this freeze.
- All 634 authoritative graph edges with point-of-use, representation, repair/reentry, risk, and
  review semantics. Repeated endpoint labels and stale machine-path provenance are omitted.
- All five phases, 40 modules, seven pathways, and every normalized first-delivery, internal-order,
  capstone-placement, revisit, exact remediation/reentry, CARS, SIRS/math, accelerated-candidate,
  held-nonrequired, and helpful-order relation.
- All 14 canonical holds (11 open and three closed), nine governance decisions, and compact metadata
  for the 652 adoption decisions directly referenced by included authoring records.
- Compact records for all 272 source occurrences plus 110 source-anchor lookup records. Every anchor
  has one deterministic, single-line, nonexpressive `label`: first the direct `AAMC_SOURCE_ANCHOR`
  record's final `official_path` heading; without one, the sole associated official topic; otherwise
  an inclusive multi-topic label or stable page/anchor-ID fallback. All 36 multi-topic anchors use
  their direct broad heading in this freeze, so no anchor is collapsed to one alphabetically chosen
  topic. Records retain stable topic/anchor IDs, sections, categories, printed pages, scope, and
  validation status without embedding source prose.
- Integer lookup indexes for lesson, KC, grouping, attachment, edge, relation, hold, adoption, and
  source-occurrence IDs.

The generator also validates, but does not embed, all 1,604 atomic source mappings and all 1,699
adoption decisions.

## Excluded

This is architecture metadata only. It excludes protected questions and keys, supplied textbook
prose, finished lesson prose, worked examples, activities, assessment items, rubrics, calibrated
mastery thresholds, and efficacy claims. Source-occurrence projection explicitly omits
`correction_rule`, `editorial_paraphrase_not_direct_quote`, `evidence_strength`, `exact_text`,
`locator_start`, `locator_end`, `locator_kind`, the full `official_path` hierarchy,
`physical_pdf_pages`, `source_document_citations`, and `source_summary`; safe printed-page
references, official-topic labels, and at most one safe final official-path component used as an
anchor's direct heading remain. Compact adoption/governance projections also omit their expressive
evidence/rationale payloads and dynamic legacy disposition maps. Graph endpoint labels, workflow
review payloads, and machine-path provenance are omitted while stable IDs and safe lineage
references remain.

The manifest records every omission by source record type under
`metadata.source_projection_policy.omitted_fields_by_record_type`. Unknown top-level or nested
source fields fail closed. Authored instructional content must be created, versioned, reviewed,
rights-cleared, and hashed separately.

## Required authoring use

Cloud lesson authors must:

1. Treat `docs/design/mcat-complete-learning-flow.md` as the canonical runtime and production
   contract and this manifest as its pinned curriculum input.
2. Bind every `LessonDefinition` to the registry artifact ID, registry SHA-256, all four freeze IDs,
   the exact `V3-LES-*` shell, its owning grouping, and its complete ordered `V3-KC-*` records.
3. Resolve graph and sequence records by stable ID. Preserve point-of-use prerequisite semantics,
   capstone boundaries, first delivery, upgraded revisits, and exact repair/reentry; do not infer a
   new order or prerequisite from array proximity.
4. Obey each attachment's `delivery_state` and `delivery_evidence`: keep `host_only` records attached
   to their frozen host, place `required` capstones at their one validated coordination relation,
   and never create mastery identity from an attachment, source topic, phase, module, or pathway.
5. Compile `V3-EXT-703019` and `V3-CAP-537139` as governance-only references. Both remain held,
   nonrequired, and outside the active sequence.
6. Keep accelerated bypass disabled and fail closed. Missing or uncertain routing evidence changes
   support, not required V3 scope.
7. Never hand-edit the generated JSON. Regenerate it from the exact package; a changed package or
   contract requires an explicitly reviewed pin update.

## Authority and validation ceiling

V3 is complete only against the supplied 2020 AAMC source ceiling. Present-day AAMC authority has
not been refreshed. The architecture, lesson/KC grain, transfer expectations, graph, sequence,
remediation, and support routing remain learner-unvalidated. The bootstrap makes no current
endorsement, mastery-threshold, readiness, or efficacy claim.

The printed page-89 stem-cell/CNS-regeneration scope remains ambiguous, held, and nonrequired. No
author may turn it into required delivery without the named hold being resolved through governance.
