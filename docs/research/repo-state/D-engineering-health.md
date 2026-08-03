# Engineering health — repo state audit

**Date:** 2026-07-29  
**Scope:** Owed work, docs, architecture tests, CI/tooling, dependencies, dead code, onboarding, conventions.  
**Out of scope:** Frontend screen analysis, backend request paths, content review (handled by sibling agents).

---

## The team's own owed-work list

Source: `key-docs/roadmap-todo.md` (sole file in `key-docs/`). The file explicitly states **nothing is scheduled, prioritized, or estimated** — it is a gap record, not a backlog with ranks. Items below preserve the file's grouping; "priority" is inferred only where the text itself contrasts cost/impact.

### 1. The delayed-check scheduler
- **Status:** Engineering gap — producer missing.
- **Impact:** `retained` and `strong` evidence tiers are unreachable by construction; learners see gap reports they cannot close.
- **Pending human decision:** None stated — the missing piece is clearly defined (due-tracking + `delayHours` producer).

### 2. Nothing authors a change dimension (transfer slot unearnable)
- **Status:** Content/owner decision, not engineering.
- **Options (owner must choose):**
  1. Author `changed_dimensions` on transfer-eligible bindings (only `V3-LES-130923` reachable in-repo today).
  2. Drop `changeDimensions: 2` from transfer slot (weakens standard).
  3. Leave slot unreachable; fix gap reporting so learners are not told to close it.
- **Note:** `retained`/`strong` already blocked by delayed slot; this mainly affects `independent_corroborated_by_transfer` and honest gap UX.

### 3. Recall card generation from lessons and mistakes
- **Status:** Deferred feature.
- **Constraint:** Must not cross Recall↔mastery wall (`RECALL_WRITES_MASTERY = false`).
- **Pending human decision:** Whether to extend `CardSourceSchema` enum for provenance.

### 4. Recall becoming due-driven rather than once-daily
- **Status:** Planner-side gap; `recall-core` per-card due logic exists.
- **Pending human decision:** How mid-day plan should react when cards cross due threshold.

### 5. Evidence ladder / lesson grain dormant at database layer
- **Status:** Roadmap cleanup — migration work.
- **Tables:** `mastery_lesson` (granted but zero callers); `mastery_projections` + siblings from `0001` (never wired).
- **Gap:** Architecture tests scan TypeScript only — SQL/CHECK constraints invisible to guards.

### 6. Two of three V3 lessons not in repository
- **Status:** **Owner decision** — content provenance vs mastery coverage.
- **Options:**
  1. Vendor `V3-LES-789208` and `V3-LES-844372` into `content/lessons/`.
  2. Leave permanently ineligible (caps BKT surface at 6/17 `CHANGED_EXIT` checks).
- **Blocks:** Conformance tests, `second-lesson-mastery-seam.test.ts`, relabel fix for `844372`.

### 7. Practice item served but never answered — no distinct state
- **Status:** Deferred; schema + product decision.
- **Pending human decision:** Whether re-serving abandoned items is harm vs withholding them from rotation.

### 8. `V3-LES-844372` six re-entry items mislabeled `REPAIR_CONFIRMATION`
- **Status:** Blocked on vendoring `844372` (out-of-repo JSON edit).

### 9. Lesson-only mastery unreachable (structural, not `isRetry`)
- **Status:** **Owner decision** — by design vs policy change.
- **Root cause:** All recipes require `{ kind: 'independent', minFamilies: 2 }`; lesson channel emits only `transfer`/`instruction`.
- **Options:**
  1. Leave it (lessons teach; practice warrants) — aligns with contract §11.
  2. Add `INDEPENDENT` to six licensed bindings (partially undoes `LESSON_EXIT_GUESS_G` premise).
  3. New independent-kind lesson item (authoring programme).

### 10. Every Today's Path lesson is preview — no evidence pipeline
- **Status:** **Owner decision** — wire 14 app-native lessons vs label seam explicitly.
- **Scale:** ~108 terminal checks of evidence metadata vs 6 licensed bindings today.
- **For two lessons:** vendoring + licensing + runtime generalization + preview retirement (four steps).

### 11. Deploying practice gate needs migration `0013` **and** grants
- **Status:** Operational — **do before ship** (no decision).
- **Checklist:** Run `0013`; add `practice_attempt_grant` (+ other practice tables) to `dataGrantSql` in migration lambda.

### 12. Practice queue `GET` performs a write
- **Status:** Operational note; route declared `stateChanging: false`.
- **Pending human decision:** Whether CSRF/Origin semantics should change.

### 13. Diagnostic effective seeding range (~38% of intended span)
- **Status:** **Owner calibration decision**, not a bug.
- **Cross-ref:** Gate 1 diagnostic attenuation item; decide with `mastery-seed-value.ts` (still uses deprecated `sqrt(lesson count)` model).

### 14. "Needs the most review" ranks on `P(L)` alone
- **Status:** **Owner/planner decision** (three interpretations documented).

### 15. Lesson submission shape long-term home (`lesson-response-seam.ts`)
- **Status:** **Owner decision** — moving to `@mcat/contracts` blocked by domain↔contracts cycle.
- **Options:** Move `ServerScoringResolution` first; leave in lambda; or mirror with parity test.

### 16. `LessonMasteryView.pL` → `meanMemberPL` rename
- **Status:** Owed UI/contract rename; governed vocabulary change.

---

## Doc inventory and contradictions

### Inventory (75 files under `docs/`)

| Category | Paths | Currency |
| -------- | ----- | -------- |
| **Normative contracts** | `lesson-evidence-mastery-contract.md`, `practice-today-contract.md`, `recall-today-contract.md`, `practice-engine.md`, `todays-path-engine.md`, `mastery-pipeline.md` | **Mixed** — several updated July 2026; `mastery-pipeline.md` header still references old branch |
| **ADRs** | `adr/0001`–`0004` | Accepted; **0002 stale on versions** (see below) |
| **Governance** | `governance/*`, `policies/public-claims.md`, `known-limitations.md` | Current |
| **Runbooks** | `runbooks/*` | Operational; current |
| **Design** | `design/*` (incl. V3 authoring spec, diagnostic findings) | Mostly current; overnight findings explicitly flag open decisions |
| **Research** | `research/**` (incl. new `daily-planner-efficacy/`, `cars-item-design/`, calibration) | Research memos — not execution specs; `daily-planner-efficacy/` untracked in git |
| **Implementation snapshot** | `implementation-status.md` | **Stale** — test counts and commit hash outdated |
| **Superpowers / AWS plans** | `superpowers/**` | Historical deployment plans (July 2026) |
| **Deferred work (canonical)** | `../key-docs/roadmap-todo.md` | **Current** — actively maintained |

### Specific contradictions (file:line)

| Conflict | Location A | Location B | Hazard |
| -------- | ---------- | ---------- | ------ |
| **`mastered` definition** | `docs/mastery-pipeline.md:20` — "`P(L)` replaces the evidence-ladder rungs as the definition of 'mastered'" | `docs/mastery-pipeline.md:43` — "`mastered` only when every required KC clears `0.95`" (no warrant mention in table row) vs `docs/lesson-evidence-mastery-contract.md:54-56` — evidence system must not answer mastered alone; `tests/architecture/mastery-definition-single-source.test.ts` — `mastered` is composed (capability + warrant) | Engineer reading §0 TL;DR believes P(L) alone suffices; code and contract require both halves |
| **Same doc, internal** | `docs/mastery-pipeline.md:38` — "Mastery definition: `P(L) ≥ 0.95` **replaces** the evidence-ladder rungs" | `docs/mastery-pipeline.md:129-148` — capability is P(L) only; composed `mastered` in rollup; ordinal tier private to authority | Table in §1 contradicts §4.1 in the same file |
| **Test suite health** | `docs/implementation-status.md:3` — "vitest 285 passed … at commit `b50ec20`" | CI 2026-07-29: **7 failed, 1554 passed** (1597 total); HEAD `e44dc75` | Onboarding doc claims green suite that CI does not have |
| **Toolchain versions** | `docs/adr/0002-toolchain-and-monorepo.md:13-14,26-27` — "React Router 7.x", "Vitest 2.1.x" | `apps/learner-web/package.json` — `react-router-dom@6.30.4`; root `vitest@3.2.6` | ADR misleads on stack; RR 6.x vs 7.x affects security patch path |
| **README package layout** | `README.md:29-35` — lists `@mcat/learner-core`, `scene-core`, `scene-web`, `analytics-events`, `ai-speech-contracts`, `test-fixtures` | `packages/` contains none of these (12 packages only) | Clone + README implies packages that do not exist |
| **Lesson contract §3 opening** | `docs/lesson-evidence-mastery-contract.md:36` — "no binding on disk declares a BKT-eligible mode" | `key-docs/roadmap-todo.md` + `v3-lesson-binding-conformance.test.ts` — 6 bindings in `V3-LES-130923` licensed `TRANSFER` for BKT | Contract header predates `e579779`; misleading for new integrators |
| **Practice ↔ Today's Path** | `docs/practice-today-contract.md:3-4` — minutes→count handoff "**planned** and intentionally **deferred**" | `docs/todays-path-engine.md:13` — "verified line-by-line against codebase" (implemented planner) | Minor — practice budget seam still deferred while planner is live |

### Documents that are current and aligned
- `key-docs/roadmap-todo.md` — detailed, cross-linked to tests and code.
- `docs/todays-path-engine.md` — explicitly documents app-native preview seam (matches roadmap §10).
- `docs/lesson-evidence-mastery-contract.md` §16 — maps rules to architecture tests (good pattern).
- `docs/known-limitations.md`, `docs/governance/authority-boundaries.md` — match README and guards.

---

## Enforced architectural invariants

From `tests/architecture/` (17 test files, 214 tests when corpus complete). Grouped by file.

### `boundaries.test.ts`
- Pure packages (`contracts`, `domain`, `policies`, `content`, `authority-core`, `recall-core`, `cars-generation`) must not depend on React, UI, platform, or apps.
- `ui-web` must not depend on router or apps.
- `landing-web` isolated — only fonts + design-tokens + React.
- Every compiled learner-safe question free of answer keys/rationales.

### `browser-boundaries.test.ts`
- Learner app: no server authority or full content imports (including bundle-reachable graph).
- Requires configured HTTP authority; no client-side question preview.
- Evidence Atlas on Home; real GLB asset; mobile viewport support.
- Service worker: API/auth network-only; closed cache allowlist; never cache authenticated responses.

### `contracts-ladder-ban.test.ts`
- No evidence ladder vocabulary (`learning`, `independent`, `retained`, `strong`, `exam_ready_now`, etc.) in exported contracts or source across `packages/`, `apps/`, `services/` (allowlisted packages only).
- Scans every workspace unit with `package.json`.

### `cross-package-enum-parity.test.ts`
- Mirrored enums in `@mcat/contracts` must match `@mcat/domain` member-for-member (EvidenceKind, ChangeDimension, reason codes, task types, etc.).

### `mastery-definition-single-source.test.ts`
- `MASTERY_THRESHOLD` (0.95) compared in exactly one place.
- `mastered` produced in exactly one place (`lesson-rollup.ts`); pass-through sites enumerated.
- `mastered` declared only on types publishing the composed claim.

### `mastery-write-path.test.ts`
- BKT writes only through `Authority.stepDirectGrains` (decay clock enforced).
- No direct `applyMasteryAttempt` / inline clamp bypasses.
- Lesson mastery derived, never stored in DB grain tables (TypeScript path).

### `lesson-mastery-integration.test.ts` (largest suite)
- Only authority moves P(L); lesson runtime never imports/calls BKT engine.
- Generic lesson seam — no lesson-specific IDs in adapter/router/engine.
- Protected material never in evidence/BKT records.
- Delivery vs capability axes separated.
- Evidence warrant vs BKT capability disjoint on types and fields.
- Local debug route never in deployed lambda.
- BKT qualification ↔ evidence kind consistency (exhaustive mode matrix).
- Fail-closed: allowlist eligibility, no runner-credited conditions, assistance cannot decide independence, server-bounded time, omission handling, unresolved scoring → no output.
- No precedence between conflicting authored keys; named contradiction codes.
- Warrant covers every grain a lesson writes.

### `lesson-mastery-reachability.test.ts`
- Lesson-only path: P(L) can reach cut; `mastered` false without `independent`-kind evidence.
- Transfer slot blocked by empty `changeDimensions` (pinned).

### `v3-lesson-binding-conformance.test.ts` + `lesson-corpus.ts`
- Exactly 3 lessons, 115 bindings (42+40+33); **failure if artifacts missing** (not skip).
- Zero authored `changed_dimensions`; prose cannot substitute.

### `curriculum-v3-parity.test.ts`
- Generated curriculum manifest: 5 phases, 40 modules, 114 lessons, 422 KCs; no forbidden keys.

### `curriculum-ui-contract.test.ts`, `vector-lesson-ui-contract.test.ts`, `mistakes-ui-contract.test.ts`, `practice-contract.test.ts`
- UI/route contracts for Curriculum, V3-LES-130923 lesson, Mistakes (no cause picker), Practice HTTP/API boundaries.

### `recall-boundary.test.ts`
- Recall never imports/writes mastery or authority-core.

### `policy-version-single-source.test.ts`
- Policy version strings cite manifests only; no stale inline `provisional-v1` copies.

### `aws-ci-workflow.test.ts`
- CI runs migration integration before postgres integration tests; no standalone "Apply migrations" step.

### Known guard gaps (documented in roadmap/tests)
- SQL migrations (`mastery_lesson`, ladder CHECK constraints) not scanned.
- App-native lessons writing no evidence — **not** architecture-tested.
- `tools/lesson-viewer` prose triggers false-positive ladder tokens (dev-only, un-scanned).

---

## Test and CI state

### Summary (local run 2026-07-29, vitest 3.2.6)

| Metric | Value |
| ------ | ----- |
| **Total tests** | 1597 |
| **Passed** | 1522 (local); 1554 (CI last run) |
| **Failed** | 39 local\* / 7 CI |
| **Skipped** | 36 |
| **Duration** | ~35s full suite |

\*Local CDK failures (33 tests) are **environment artifact**: `spawnSync pnpm ENOENT` during asset bundling — not product failures when pnpm is on PATH. CI runs pnpm and CDK tests pass there.

### Failures on clean checkout (real)

| Failure | Count | Cause |
| ------- | ----- | ----- |
| `v3-lesson-binding-conformance.test.ts` | 5 | Missing `V3-LES-789208`, `V3-LES-844372` artifacts |
| `lesson-mastery-integration.test.ts` | 1 | Same missing corpus |
| `second-lesson-mastery-seam.test.ts` | suite | `ENOENT` reading `../research/.../V3-LES-844372/lesson-script.json` |
| `snapshot-score.test.ts` | 1 (CI only) | 20,736-profile property test **timeout at 5000ms** (passes locally in ~2.4s) |

**Verified:** No other architecture failures beyond missing lesson artifacts on this machine (sibling `research/` path absent).

### Skipped tests (by pattern)

| Condition | Suites affected | Reason |
| --------- | --------------- | ------ |
| `DATABASE_URL` unset | 6 postgres integration files | Skip outside CI/VPC |
| `PRODUCTION_FORM_SERVABLE` false | `diagnostic.test.ts` (3 describes) | Production diagnostic form not in env |
| `STUDY` / `MERGE` / `ENABLED` env | `diagnostic-*-sweep`, `diagnostic-retest`, `mastery-seed-value` | Long-running research sweeps |
| `DEEP_LEARNERS` | `certainty-bands.test.ts` | Optional depth study |
| `RETEST_PIN` | `diagnostic-retest.test.ts` | Pin cell only when env set |

### CI (`.github/workflows/aws-backend-ci.yml`)

**Triggers:** PR + push to `main`, `codex/**`.

**Steps:** checkout → pnpm install frozen → **`pnpm audit --prod --audit-level high`** → `pnpm run verify` (lint + typecheck + test + protected scan, **without** `TEST_DATABASE_URL`) → migration runtime integration → persistence + learner-api + workers integration → build → CDK test/typecheck/synth → learner dist leak scan.

| Check | In CI? |
| ----- | ------ |
| Lint | Yes (`eslint .`) |
| Typecheck | Yes (`turbo run typecheck`) |
| Unit + architecture tests | Yes |
| Postgres integration | Yes (service container) |
| Build | Yes |
| CDK synth | Yes |
| Protected field scan | Yes |
| E2E / Playwright | **No** |
| Prettier | **No** (only via local `format:check` if run) |
| Full `pnpm audit` (dev deps) | **No** — prod high only |

**CI status:** **Red** on latest `main` push (`e44dc75`, 2026-07-29) — 7 test failures (6 lesson corpus + 1 snapshot timeout). Lint: 29 warnings, 0 errors.

### Tooling config
- **Monorepo:** pnpm 9.15.9 workspaces + Turbo (`build`, `typecheck`, `dev`).
- **Tests:** `vitest.workspace.ts` — `unit` + `architecture` projects (workspace file deprecated in vitest 3).
- **TS:** `tsconfig.base.json` — strict + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.

---

## Dependency and security state

### Open Dependabot alerts (5 on default branch)

| Severity | Package | Summary |
| -------- | ------- | ------- |
| **High** | `brace-expansion` | DoS via unbounded expansion (transitive via ESLint/minimatch) |
| Moderate | `react-router` | Open redirect via backslash (CVE-2025-68470 bypass) |
| Moderate | `react-router-dom` | Open redirect → XSS |
| Moderate | `react-router` | Constructor injection via `deserializeErrors()` SSR |
| Moderate | `react-router-dom` | Open redirect → XSS (duplicate advisory) |

### `pnpm audit` (2026-07-29)

- **Production:** 3 moderate (react-router chain in learner-web).
- **All deps:** 5 vulnerabilities (3 moderate + 2 high — includes brace-expansion).

### Root override note (`package.json:43-46`)
- `@eslint/plugin-kit` pinned for GHSA-xffm-g5w8-qvg7.
- `brace-expansion` **intentionally not overridden** — patched 5.x breaks ESLint 9's minimatch@3; needs ESLint toolchain upgrade.

### Dev-only exposure
- Many **critical** vitest/vite advisories in Dependabot history — dev-server RCE when UI server listening; not production attack surface but relevant for local dev.

---

## Dead code

### Packages / modules referenced but missing
| Referenced in | Missing package |
| ------------- | --------------- |
| `README.md:29-35`, `vitest.workspace.ts:19-23` | `@mcat/learner-core`, `scene-core`, `scene-web`, `analytics-events`, `ai-speech-contracts`, `test-fixtures` |

No source imports these — README and vitest globs are stale.

### Dead props / callbacks
- `apps/learner-web/src/app-native/LessonRenderer.tsx:60,1110` — `onIndependentMiss` prop fired but **no caller** since commit `658a8c3` removed the only consumer.

### Dormant database objects (not dead TS, but dead schema)
- `mastery_lesson` table + grant — zero application callers (`roadmap-todo.md`).
- `mastery_projections`, `plan_projections`, `review_projections`, `error_projections` — never granted to API role.

### `.generated.ts` files and generators

| File | Generator | Drift risk |
| ---- | --------- | ---------- |
| `apps/learner-web/src/data/curriculum-v3.generated.ts` | `apps/learner-web/scripts/generate-curriculum-v3.mjs` | Regenerate after manifest changes; pinned by `curriculum-v3-parity.test.ts` |
| `packages/policies/src/data/bank-profiles.generated.ts` | `scripts/generate-bank-profiles.mjs` | Depends on bank + `fc-lessons` |
| `packages/policies/src/data/fc-lessons.generated.ts` | `scripts/generate-fc-lessons.mjs` | Chain: axis → lessons → profiles |
| `packages/policies/src/data/fc-axis.generated.ts` | `scripts/generate-fc-axis.mjs` | |
| `packages/policies/src/data/unlock-weights.generated.ts` | `scripts/generate-unlock-weights.mjs` | |

No CI step regenerates or verifies freshness vs sources — drift is caught only when counts/parity tests fail.

### Tools with limited/no CI wiring
- `tools/lesson-viewer/` — dev viewer; excluded from ladder ban; not in verify pipeline.
- `scan:vector-lesson-bundle` — root script; not in CI `verify`.

### Hardcoded path smell (local-only)
- `tools/content-cli/src/main.ts:33` — absolute path to external question corpus (won't work on other machines).

---

## Onboarding: what breaks on a fresh clone

### Works after `pnpm install`
- `pnpm run typecheck` (with turbo build deps).
- Most unit tests (~1522/1597).
- `pnpm --filter @mcat/learner-web dev` with `.env.local` from example (Vite proxy to authority).
- `pnpm run dev:lesson` — loopback authority + learner (in-memory; Lesson 1 only).

### Fails or degrades without extra setup

| Step | Failure |
| ---- | ------- |
| `pnpm run test` / `pnpm run verify` | **6–7 failures** if `../research/mcat-curriculum-architecture-v3/lesson-authoring-drafts/` absent and `MCAT_LESSON_DRAFTS_DIR` unset |
| Vector lesson conformance / integration | Same — expects 115 bindings across 3 lessons |
| `second-lesson-mastery-seam.test.ts` | Hard `readFileSync` to sibling drafts path — throws ENOENT |
| Postgres integration tests | Skipped unless `TEST_DATABASE_URL` set |
| Full AWS-like practice scoring | Needs migration `0013` + grants (`roadmap-todo.md` §11) |
| CDK tests locally | Fail if `pnpm` not on PATH (bundling) |
| `pnpm run dev:local` | Copies `.env.example` — OK; still needs authority for API calls unless using proxy/default |
| Database-backed dev | Requires `.env` with `DATABASE_URL` (gitignored); migrations via migration lambda |
| Content CLI with real bank | `tools/content-cli` default path is author-specific |
| CARS generation / AI | `@mcat/ai-gateway` — providers off by default |

### External / sibling dependencies
- **Required for green architecture suite:** two lesson JSON trees (vendor or set `MCAT_LESSON_DRAFTS_DIR`).
- **Optional:** `../research/` PDFs (copyright — never committed); Postgres for integration.

### README gaps
- Does not mention lesson drafts sibling or `MCAT_LESSON_DRAFTS_DIR`.
- Lists packages that do not exist.
- `implementation-status.md` overstates verify greenness.

---

## Conventions

### Explicit rules
- **ESLint** (`eslint.config.js`): `@typescript-eslint/no-unused-vars`, `consistent-type-imports`, `eqeqeq`, `no-console` warn (off in tests/tools).
- **TypeScript** (`tsconfig.base.json`): strictest practical — unused locals/params, exact optional properties, no unchecked indexed access.
- **Authority** (`docs/governance/authority-boundaries.md`): server owns correctness/mastery; client owns presentation only.
- **No ladder on wire** — enforced by architecture tests + contract.
- **Policy versions** — single manifest source (`policy-version-single-source.test.ts`).

### Doc-comment / rationale convention (distinctive)
- **Architecture test files** carry long file-level block comments explaining *why* the guard exists, past incidents (commit hashes), and known scope limits — e.g. `contracts-ladder-ban.test.ts:1-72`, `mastery-write-path.test.ts:7-28`, `lesson-mastery-reachability.test.ts:1-63`.
- **Rationale for deferred work** lives in `key-docs/roadmap-todo.md` (narrative, code pointers, owner decisions) — not in JIRA.
- **Normative behavior** lives in `docs/*-contract.md` with §16 mapping rules → test names.
- **Producer-side warnings** on misleading fields — e.g. `packages/contracts/src/mastery.ts:110-119` (`pL` on lesson view is mean, not mastery prob).
- **Comments in code** explain non-obvious invariants and historical regressions; ordinary code expected self-explanatory per team norm.

### Git hygiene
- `.gitignore` covers `.env*`, `.tmp/`, `.data/`, `dist/`, protected content, PDFs, large models.
- **Repo size:** ~1.9 GB working tree; **~755 MB `.tmp/`** (gitignored) — local QA artifacts, screenshots, sweep outputs; not committed.
- Largest tracked files: `curriculum/v3/v3-lesson-authoring-manifest.json` (~6 MB), browser evidence PNGs, `brain.glb`.

---

## Highest-leverage fixes in my area

Ranked by impact ÷ effort for engineering health (not product feature delivery).

| Rank | Fix | Effort | Benefit |
| ---- | --- | ------ | ------- |
| 1 | **Vendor `V3-LES-789208` + `V3-LES-844372` into `content/lessons/`** (or submodule + CI checkout) | 2–4 h | Restores green CI/architecture suite on clean clone; unblocks conformance, integration, second-lesson seam test; enables content commits |
| 2 | **Deploy checklist: migration `0013` + practice table grants** in `runtime.ts` | 2–3 h | Prevents silent practice gate failure in multi-instance prod |
| 3 | **Reconcile `docs/mastery-pipeline.md` §0/§1 with composed `mastered`** (align with contract + tests) | 1–2 h | Stops teammates implementing P(L)-only mastery |
| 4 | **Fix CI flake: increase timeout or shard `snapshot-score` 20k-profile test** | 0.5 h | Stabilizes CI without weakening coverage |
| 5 | **Refresh `implementation-status.md` + README package list + ADR 0002 versions** | 1–2 h | Accurate onboarding; RR/vite version truth for security upgrades |
| 6 | **Remove dead `onIndependentMiss` prop** from `LessonRenderer` | 0.5 h | Clarity; documents intentional non-wiring |
| 7 | **ESLint/toolchain upgrade path for brace-expansion** (or document accepted risk) | 4–8 h | Closes 1 high Dependabot alert |
| 8 | **Drop dormant DB tables** (`mastery_lesson`, unused projections) + revoke grants | 4–6 h | Removes competing source-of-truth landmine; requires deploy sequencing |
| 9 | **Add `format:check` or pre-commit to CI** | 0.5 h | Catches formatting drift (optional) |
| 10 | **Regenerate-verify job for `.generated.ts` artifacts** | 2–4 h | Catches generator drift before parity tests fail opaquely |

---

*Generated by engineering-health audit agent, 2026-07-29.*
