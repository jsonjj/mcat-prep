# Registering a lesson (making an authored lesson servable)

Lessons are **file-based** content, not database rows. A lesson only becomes
launchable in the app once it is (1) authored on disk, (2) validated, and
(3) **registered** in the app's manifest. Until a lesson is registered it renders
as a disabled **"Coming soon"** card in the Curriculum; registered lessons get a
server-authoritative **Start/Continue** and appear in Today's Path.

This runbook is the checklist to take a newly authored lesson from files to
servable. It is written for the case where lessons are generated over time and
registered "as they land."

> The registration manifest — `apps/learner-web/src/app/lesson-catalog.ts`
> (`REGISTERED_LESSONS`) — is the **single source of truth** for servability. A
> boot guard (`assertValidLessonRegistry`) cross-checks every entry against the
> generated curriculum and the cluster atlas and **throws at app load** on any
> mismatch, so a mis-registration fails fast rather than serving broken content.

---

## The 7 steps

### 1. Place the authored artifacts on disk
Create `content/lessons/<lesson-id-lowercased>/` (e.g. lesson `V3-LES-789208` →
`content/lessons/v3-les-789208/`). Required:
- `lesson-script.json` (always)
- For L2/L3 (normalized-engine) lessons also: `learner-safe-items.json`,
  `protected-items.json`, plus the usual `artifact-manifest.json`,
  `kc-coverage-matrix.json`, `lesson-presentation-plan.json`,
  `lesson-quality-report.json`.

The deploy bundles `content/lessons/*` into the learner-API Lambda, so the
content must be committed to the repo.

### 2. Validate (R1–R15 gate)
```bash
pnpm --filter @mcat/content-cli start lesson-validate
```
This runs the structural gate; **R14** cross-checks the lesson's declared KCs
against `curriculum/v3/v3-lesson-authoring-manifest.json`. Fix any failures
before registering.

### 3. Register it in the manifest
Add a `RegisteredLesson` to `REGISTERED_LESSONS` in
`apps/learner-web/src/app/lesson-catalog.ts`:
- `lessonId` — canonical `V3-LES-######`.
- `slug` — L1 uses a friendly topic slug (`vectors-and-trigonometry`); normalized
  lessons use the lower-cased id (`v3-les-789208`).
- `runtime` — `'vector'` for the bespoke L1 runtime, `'normalized'` for L2/L3.
- `title` — **must equal** the curriculum's `shortTitle` (the boot guard pins it).
- `section`, `cluster` — `cluster` **must equal** `ATLAS_LESSON_CLUSTER[lessonId]`.
- `kcIds` — **must equal** the curriculum's ordered KC list for the lesson.
- `prerequisiteLessonIds` — each must itself be a registered lesson.
- `routePath` — always `/app/lessons/<slug>`.

### 4. Add the client route
In `apps/learner-web/src/app/router.tsx`, add a route at `lessons/<slug>`:
- L1 → its bespoke screen (`<VectorLesson />`).
- Normalized → `<CatalogLesson lessonId="V3-LES-######" />`.

### 5. (Normalized lessons only) Add the server route slug
Add `<slug>: <lessonId>` to `NORMALIZED_LESSON_ROUTE_SLUGS` in
`services/lambdas/learner-api/src/routes.ts` so the API serves
`/v1/lessons/<slug>/{status,start,run,commands}`.

### 6. Update the pinned contract test
`tests/architecture/catalog-lesson-routes-contract.test.ts` pins the exact list
of registered lesson ids; add the new id there. (This is deliberate — it makes
every registration a reviewed change.)

### 7. Verify
```bash
pnpm typecheck
pnpm exec vitest run tests/architecture
```
Key gates: `catalog-lesson-routes-contract` (routes + the "content exists on disk"
guard), `curriculum-ui-contract`, and `vector-lesson-ui-contract`.

---

## Checking what's registered vs authored
- Registered lessons: `REGISTERED_LESSONS` in `lesson-catalog.ts`.
- Authored on disk: the directories under `content/lessons/`.
- The `catalog-lesson-routes-contract` test fails if a **registered** lesson has
  no content on disk. A lesson that is authored on disk but **not yet registered**
  is intentional (it may still be pre-validation) and simply stays "Coming soon"
  until you complete the steps above.

## Notes
- Content directory name = `lessonId.toLowerCase()`.
- `estimatedMinutes` is currently an authoring estimate (artifacts don't yet carry
  a duration); Today's Path sizing uses it, so keep it realistic.
- Lesson **content** is file-based today; a DB-backed provider is a documented
  future option (design note D5) and is **not** required to ship lessons.
