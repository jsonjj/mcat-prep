# Frontend and user-journey audit (learner + landing)

Scope: learner-facing UI, end-to-end journeys, and client state. Backend kernel internals and policy algorithms are out of scope.

Audit date: 2026-07-29.

---

## Route and screen inventory

Two separate Vite apps: **`apps/learner-web`** (product) and **`apps/landing-web`** (marketing + Snapshot diagnostic teaser). They do not link to each other.

### Learner web (`apps/learner-web/src/app/router.tsx`)

| Route | Screen file | Status | Notes |
|-------|-------------|--------|-------|
| `/` | `screens/Welcome.tsx` | **Functional** | Entry gate; offers diagnostic or skip to plan. Reads `useBootstrap`, `isDiagnosticCompleted()` (localStorage). |
| `/onboarding/diagnostic` | `screens/Diagnostic.tsx` | **Functional** (dev server) | Real multistage diagnostic via `/api/diagnostic`. Skip goes to plan without marking complete. Applies mastery seed on complete (best-effort, silent failure). |
| `/onboarding/plan` | `screens/PlanSetup.tsx` | **Functional** | `useConfirmPlan` → unlocks `/app`. No AppShell guard here (reachable pre-unlock). |
| `/app/lesson/:slug` | `screens/Lesson.tsx` + `app-native/LessonRenderer.tsx` | **Partially functional** | 14 pilot lessons playable; unknown slug shows “isn’t available yet”. **Outside AppShell** — no onboarding guard. Completion writes **localStorage only**; mastery evidence **not** minted (see below). |
| `/cars-preview` | `screens/CarsPreview.tsx` | **Functional (internal)** | Generator QA surface; outside AppShell; no evidence. Not linked from learner nav. |
| `/app` (index) | `screens/Home.tsx` | **Functional** | Hero brain (decorative), Today’s Path up-next, Passage link, Wrapped teaser. Requires onboarding. |
| `/app/today` | `screens/today/TodaysPath.tsx` | **Functional** | Plan builder + guided runner launch. Auto-builds plan on first visit. **Not in mobile bottom nav** (sidebar/desktop only). |
| `/app/curriculum` | `screens/Curriculum.tsx` | **Partially functional** | Full V3 map (~114 first-delivery lessons). **14 “Ready to play”** app-native + **1 server lesson** (`V3-LES-130923` vectors). Rest: disabled “Coming soon”. |
| `/app/lessons/vectors-and-trigonometry` | `screens/VectorLesson.tsx` | **Partially functional** | Server-authoritative lesson runtime. Shows **`INTERNAL_DRAFT_ONLY`** banner to users. Writes checkpoints server-side. |
| `/app/learn` | `screens/Study.tsx` | **Functional (legacy loop)** | Synthetic enzyme study loop (`useSession`). **Not in primary nav.** Linked from orphaned `GhostCompanion` and `SkillDetail`. |
| `/app/recall` | `screens/recall/RecallHome.tsx` | **Functional** | IndexedDB-backed FSRS deck; fully client-side. |
| `/app/recall/review` | `screens/recall/RecallReview.tsx` | **Functional** | Review session; supports Today’s Path return contract. |
| `/app/recall/browse` | `screens/recall/CardBrowser.tsx` | **Functional** | Search/filter deck. |
| `/app/recall/new` | `screens/recall/CardEditor.tsx` | **Functional** | Create basic/cloze cards + media. |
| `/app/recall/edit/:cardId` | `screens/recall/CardEditor.tsx` | **Functional** | Edit existing card. |
| `/app/recall/import` | `screens/recall/ImportApkg.tsx` | **Functional** | APKG import → IndexedDB. |
| `/app/mistakes` | `screens/Mistakes.tsx` | **Functional** | Error log + patterns; “try again” → Practice session. |
| `/app/progress` | `screens/Progress.tsx` | **Functional** | Merged dashboard: 7 skill rings, Evidence Atlas brain, CARS readiness. |
| `/app/skills` | `router.tsx` → redirect | **Redirect** | → `/app/progress`. |
| `/app/skills/:skillId` | `screens/SkillDetail.tsx` | **Stub / orphaned** | Renders if URL typed manually. **No in-app links** to this route. Most clusters show “Content coming”. |
| `/app/passage` | `screens/PassageOfDay.tsx` | **Partially functional** | Hardcoded single item `q-enzyme-passage-1`; not actually “of the day”. |
| `/app/cars` | `screens/CarsDuel.tsx` | **Partially functional** | Needs dev AI proxy (`AI_API_KEY` in `.env`). Without it: “offline” dead-end with retry. **Not in mobile bottom nav.** |
| `/app/wrapped` | `screens/Wrapped.tsx` | **Functional** | Weekly evidence recap from authority. Linked from Home `WrappedCard`. |
| `/app/practice` | `screens/practice/PracticeHome.tsx` | **Functional** (gated) | Empty until lessons completed + `taughtKcIds` populated. **Not in mobile bottom nav.** |
| `/app/practice/session` | `screens/practice/PracticeSession.tsx` | **Functional** (gated) | Adaptive queue; empty states explain “start with a lesson”. |
| `/app/profile` | `screens/Profile.tsx` | **Functional** | Theme, daily budget, ghost toggle, reminders (browser-only), reset progress. |

### Landing web (`apps/landing-web/src/App.tsx`)

| Surface | File | Status | Notes |
|---------|------|--------|-------|
| `/` (SPA) | `App.tsx` | **Functional** | Marketing page; Snapshot opens in-place overlay. |
| Snapshot flow | `diagnostic/SnapshotExperience.tsx` | **Functional** | 12-question paired diagnostic; posts to `/api/snapshot/*`. In-memory attempt store (server). Email optional via `BetaUpdatesDialog`. **No bridge to learner app.** |

---

## The new-user journey, step by step

### A. Landing (marketing) — standalone

1. User lands on **`apps/landing-web`** hero.
2. **Take Snapshot** → `SnapshotExperience`: intro → 12 questions → immediate report (`snapshot-api.ts` / in-memory store).
3. Optional beta email capture; FAQ correctly disclaims score prediction.
4. **Dead end:** no CTA to open `learner-web`, create account, or import Snapshot results. Landing and learner apps are disconnected products today.

### B. Learner onboarding → first study day

1. **`/` Welcome** (`Welcome.tsx`): “Begin placement” or “Skip for now”.
2. **Skip** → `/onboarding/plan` directly (`onSkip`). Onboarding can complete **without** diagnostic.
3. **Diagnostic** (`/onboarding/diagnostic`): block-by-block MCQ; drafts in **sessionStorage**; completion sets `localStorage` flag + applies mastery seed (KC priors only).
4. **Plan setup** (`PlanSetup.tsx`): test date, target score, weekly hours → `confirmPlan` → **`/app`**.
5. **AppShell** (`AppShell.tsx`): if `!onboardingComplete`, any `/app/*` route redirects to `/`.
6. **Home** (`Home.tsx`): `useEnsureTodaysPath` auto-invokes `buildTodaysPath` on first load (shows “Building today’s path…” on Today tab too).
7. User launches activity from Home or **`/app/today`**.

### Friction points, dead ends, silent no-ops

| Step | Issue | Severity |
|------|-------|----------|
| Landing → learner | No navigation or data handoff between apps | High — two separate funnels |
| Skip diagnostic | Plan works; Welcome keeps re-offering placement until diagnostic **completed** (not skipped) | Medium — confusing but documented in code |
| `/app/lesson/:slug` before onboarding | Route **outside AppShell** — lesson playable with zero authority state | Medium |
| Complete app-native lesson | Plan activity marked complete → `completedLessons` updated, but **`taughtKcIds` only updates on next `buildTodaysPath`** | **High** — Practice may still show “Start with a lesson” until plan rebuilds |
| App-native lesson completion | **No mastery evidence** written; Progress brain unchanged | **High** — dishonest if user expects atlas to move |
| Practice unlock | Planner schedules practice only after **`practiceUnlockLessons` (3)** completed lessons | Medium — early Practice tab empty by design |
| Practice without `DATABASE_URL` | Dev authority uses **7-question synthetic bank** — exhausts in one session | High in local dev |
| CARS Duel | Requires `AI_API_KEY`; fails closed with setup instructions | Medium in dev |
| Passage of the Day | Same hardcoded question every visit; label implies daily rotation | Low — misleading copy |
| Home hero brain | `EvidenceAtlas variant="home"` renders **all regions as mastered** (`isHome ? 'done'`) | Medium — decorative but looks like progress |
| Vector lesson | **`INTERNAL_DRAFT_ONLY`** visible in UI | Medium — internal marker exposed |
| Reminders toggle | Stores preference only; **no scheduled notifications** yet | Low — copy admits this |
| Profile “Export and deletion” | Copy says “supported in the full build” — not implemented | Low |

---

## Per-tab read/write map

### Home (`/app`)

| Read | Write |
|------|-------|
| `bootstrap`, `today`, `todays-path`, `mastery-skills` | Indirect: `useConsumeCompletedActivity` → `recordPlanActivity(complete)`; `useLaunchPlanActivity` → `in_progress` + navigate |

**Flags:** Decorative brain shows full mastery (`EvidenceAtlas.tsx` `variant="home"`). “X skills glowing” uses real BKT data (`useMasterySkills`).

### Today (`/app/today`) — sidebar only on desktop

| Read | Write |
|------|-------|
| `todays-path`, recall load (for build input) | `buildTodaysPath`, `setDailyBudget`, `recordPlanActivity`, launch activities |

**Flags:** Mobile users must reach via Home link — not in bottom nav.

### Curriculum (`/app/curriculum`)

| Read | Write |
|------|-------|
| Static `curriculum-v3.generated.ts`, `useVectorLessonStatus` for target lesson | `useStartVectorLesson` for `V3-LES-130923` only |

**Flags:** ~100 “Coming soon” disabled buttons. Playable count: **14 app-native + 1 vector**.

### Practice (`/app/practice`) — sidebar only

| Read | Write |
|------|-------|
| `mastery-lessons` (weakest trio), `practice-queue`, attempt results | `submitPracticeAttempt` → mastery, mistakes, progress caches |

**Flags:** “Needs the most review” uses **prior P(L)=0.2** for untouched lessons — shows precision not yet earned. Practice intro claims mastery rises on first correct try — **false after app-native-only path** until independent practice evidence exists.

### Recall (`/app/recall`)

| Read | Write |
|------|-------|
| IndexedDB via `RecallService` (`recall` query keys) | Card CRUD, reviews, import — **never** authority/mastery |

Fully client-owned; no Postgres.

### Mistakes (`/app/mistakes`)

| Read | Write |
|------|-------|
| `errors`, `error-patterns` | None directly; launches Practice with focus |

### Progress (`/app/progress`)

| Read | Write |
|------|-------|
| `mastery-skills`, `mastery-lessons`, `lesson-warrants`, `cars-readiness` | None |

**Flags:** Skill rings can show “Strong” from BKT without warrant copy on this rail (by design). Brain uses provisional **12-lesson unlock window** — not real prerequisites.

### CARS Duel (`/app/cars`) — sidebar only

| Read | Write |
|------|-------|
| — | `recordCarsDuel` (contextual CARS nudge, not mastery) |

Requires `/api/ai/chat` proxy.

### Profile (`/app/profile`)

| Read | Write |
|------|-------|
| `bootstrap`, `todays-path` | `setDailyBudget` + rebuild path, `resetProgress`, localStorage (ghost, reminders) |

---

## Broken, stubbed, or dishonest surfaces

### App-native lessons (14 total — `app-native/index.ts`)

How they work:

- Scripted nodes rendered by `LessonRenderer.tsx`.
- Progress persisted in **localStorage** key `mcat-app-native-preview:{slug}:{contentVersion}`.
- Questions scored client-side; optional `onIndependentMiss` callback exists but **`Lesson.tsx` never passes it** — misses are not forwarded anywhere.
- Completion: `CompletionScreen` → `onComplete` only when launched from Today’s Path (marks plan activity complete). Direct curriculum launch uses `<a href>` back — still no server writes.

**Mastery evidence gap (verified):**

- `contract.ts` explicitly excludes mastery claims from the preview contract.
- Completing a lesson via Today’s Path calls `recordPlanActivity(complete)` which adds `lessonId` to `completedLessons` but **does not** submit lesson question attempts to the authority kernel.
- **Blast radius:**
  1. **Progress / Evidence Atlas** — no P(L) movement, nodes stay dark/yellow-prior.
  2. **Practice** — `completedLessons` updates, but **`taughtKcIds` stale until next plan build**; queue may remain empty (`nothingTaught`).
  3. **Today’s Path** — shows lesson “Finished”; may schedule Practice only after 3 completions + rebuild; prerequisite unlock for `V3-LES-128144` depends on `completedLessons` (works for planner, not mastery).
  4. **Mistakes** — app-native independent misses never logged.
  5. **Wrapped / skill rings** — no new evidence counts.
  6. **User trust** — Curriculum says “Ready to play”; Practice says “finish a lesson”; Progress unchanged — feels broken.

### Vector lesson (`V3-LES-130923`)

- Server-authoritative via `useVectorLessonRun` / `useSubmitVectorLessonAction`.
- Does write checkpoints and (per backend) can mint evidence — frontend shows **`INTERNAL_DRAFT_ONLY`** (`VectorLesson.tsx:76-78`).
- Separate route `/app/lessons/vectors-and-trigonometry` vs curriculum start path from server.

### Study loop (`/app/learn`)

- Legacy synthetic **enzyme** topic; fully wired to authority session API.
- Orphaned from main nav; only reachable via GhostCompanion (also orphaned) or SkillDetail CTA.

### Passage of the Day

- Hardcoded `DAILY_ITEM = 'q-enzyme-passage-1'` — not date-rotated.

### SkillDetail

- Orphaned route; `useSkills()` likely empty in dev synthetic bank → “Content coming” for most clusters.

### Home decorative brain

- Shows fully mastered brain regardless of user state — aspirational, not labeled “preview” on Home.

---

## Stale-cache and state bugs

### React Query architecture

- Central invalidation sets in `app/invalidation-keys.ts`.
- Default `staleTime: 0` on most queries.
- **`LEARNER_KEYS` does not include `todays-path`** — broad mutations (Study, diagnostic seed, vector lesson, reset) skip Today's Path cache.

### Known fixed class

- Practice → Mistakes staleness (documented in `invalidation-keys.ts` + tests).

### Likely remaining stale-cache / coherence bugs

| Scenario | Symptom | Files |
|----------|---------|-------|
| Complete app-native lesson, return Home | Plan activity marked done but **`taughtKcIds` unchanged** until manual plan rebuild | `authority.ts` `recordPlanActivity` vs `buildTodaysPath`; `today-queries.ts` |
| `useConfirmPlan` / diagnostic seed | Invalidates `LEARNER_KEYS` but not `todays-path` | `queries.ts` `invalidateLearner` |
| Import Recall mid-day | `useEnsureTodaysPath` may rebuild once for Recall injection — OK; but no mastery invalidation needed | `today-queries.ts` |
| `useRecordPlanActivity(in_progress)` | Invalidates `TODAYS_PATH_INVALIDATE` only — OK | |
| Practice session from Today | Mastery updates; plan pointer may lag until return + `useConsumeCompletedActivity` | By design but easy to misread |

### localStorage usage (client)

| Key | Purpose |
|-----|---------|
| `mc.diagnostic.completed.v1` | Diagnostic genuinely finished |
| `mcat-app-native-preview:*` | App-native lesson runtime |
| `mc.ghost.optout` | Ghost companion |
| `mc.reminders.enabled` | Reminder preference (no scheduler) |
| `mc.wrapped.dismissedWeek` | Wrapped card dismiss |

Diagnostic block drafts: **sessionStorage** via `diagnostic-client.ts`.

Recall: **IndexedDB** (not localStorage).

Dev authority: **in-memory** snapshot in Node (`authority-api.ts`) — lost on server restart.

---

## Orphaned code

| Item | Location | Notes |
|------|----------|-------|
| `GhostCompanion` | `components/GhostCompanion.tsx` | Never imported by any screen except Profile (opt-out helpers). CTA links to `/app/learn`. |
| `SkillDetail` | `screens/SkillDetail.tsx` | Route exists; no navigation links |
| `/app/learn` Study | `screens/Study.tsx` | Not in `AppShell` nav |
| `/app/skills/:skillId` | router | Orphaned detail |
| `/cars-preview` | `screens/CarsPreview.tsx` | Internal QA; no nav link |
| `IconRecall` | `components/icons.tsx` | Nav uses `IconBrain` for Recall tab |

### Routes without nav links (intentional or gap)

- `/app/today`, `/app/practice`, `/app/cars` — desktop sidebar only; mobile relies on Home shortcuts.
- `/app/passage`, `/app/wrapped` — linked from Home only.
- `/app/lesson/:slug` — linked from Curriculum / Today launch.

---

## Accessibility / mobile / responsive

**Strengths:**

- Skip links (`SkipLink`, landing skip link).
- Diagnostic + app-native lessons: focus management, palette navigation, reduced-motion CSS.
- Curriculum: ARIA tablist with arrow-key pattern.
- Bottom nav at ≤840px with 5 tabs; touch-target comments in CSS (~48px recall targets).
- Breakpoints down to 320px documented in `app.css` / `app-native.css`.

**Gaps:**

- **Today, Practice, CARS Duel missing from mobile bottom nav** (`AppShell.tsx` comment acknowledges this) — primary daily loop harder on phone.
- 3D Evidence Atlas requires WebGL; falls back to static `BrainAtlas` with hint.
- CARS Duel uses `<textarea>` — usable on mobile but dense.
- Vector lesson `INTERNAL_DRAFT_ONLY` badge always visible.
- Reminders depend on `Notification` API — blocked state handled.

Overall: **usable on phone for Recall, Mistakes, Progress, Curriculum browse**; **friction for Today/Practice/CARS on mobile**.

---

## Placeholder copy / TODO / fake data visible to users

| Location | Text / behavior |
|----------|-----------------|
| `Curriculum.tsx` | “Coming soon” on ~100 lessons |
| `VectorLesson.tsx` | **`INTERNAL_DRAFT_ONLY`** |
| `SkillDetail.tsx` | “Content coming” |
| `Lesson.tsx` | “This lesson isn’t available yet” |
| `PassageOfDay.tsx` | “Passage of the day” but static item |
| `Home.tsx` / `EvidenceAtlas.tsx` | Fully mastered decorative brain |
| `PracticeHome.tsx` | Weakest-lesson rings at 20% prior |
| `Profile.tsx` | “Export and deletion are supported in the full build” |
| `landing-web` hero | “Example output / Provisional” on proof card (labeled) |
| `CarsDuel.tsx` | Single hardcoded topic from `SUGGESTED_TOPICS[0]` |

No lorem ipsum found in learner-facing screens.

---

## Highest-leverage fixes in my area

Ranked by user-visible impact × feasibility.

| Rank | Fix | Effort | User-visible benefit |
|------|-----|--------|----------------------|
| 1 | **Wire app-native lesson completion to authority** — submit independent-stage attempts + lesson delivery evidence (or call existing completion hook) | 16–24 h | Progress, Practice, and Today’s Path finally agree; core product promise works |
| 2 | **Refresh `taughtKcIds` on lesson activity complete** (or re-run `buildTodaysPath` after completion) | 4–6 h | Practice unlocks immediately after first lesson instead of silent empty queue |
| 3 | **Add Today + Practice to mobile nav** (or persistent Home shortcuts that match sidebar) | 4–8 h | Phone-first MCAT students can run daily loop without hunting |
| 4 | **Remove or gate `INTERNAL_DRAFT_ONLY` + fix Home brain honesty** (label “Preview” or show real progress on Home) | 2–4 h | Stops visible “prototype lies” on first impression |
| 5 | **Landing → learner bridge** (CTA to learner app; optional Snapshot handoff) | 8–12 h | Marketing funnel connects to product |
| 6 | **Mount `GhostCompanion` on Home or delete dead code** | 1–2 h | Removes confusing orphaned `/app/learn` path |
| 7 | **Passage of the Day rotation** or rename to “Sample passage” | 2–4 h | Label matches behavior |
| 8 | **Invalidate `todays-path` in `LEARNER_KEYS` or on lesson/practice coherence events** | 2–3 h | Reduces stale plan readouts after Study/diagnostic |

---

## Appendix: DATABASE_URL dependency by surface

| Surface | Without `DATABASE_URL` (typical fresh clone) | With Postgres |
|---------|-----------------------------------------------|---------------|
| Onboarding / plan / Today | In-memory authority — **works** | Works |
| App-native lessons | localStorage only — **works, no mastery** | Same frontend; still no mastery until wired |
| Vector lesson | In-memory checkpoints — **works** | Persistent if backend uses DB |
| Practice | **Synthetic 7-Q bank** — dead-ends quickly | Full bank + persistent exposure |
| Diagnostic | Synthetic/pull fallback in dev server | Can use pulled corpus |
| Recall | IndexedDB — **works** | Same |
| CARS Duel | Needs AI key, not DB | Same |
| Landing Snapshot | In-memory store — **works** | Same |

Practice bank selection: `server/practice-bank-source.ts`.
