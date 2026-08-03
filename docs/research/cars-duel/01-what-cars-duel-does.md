# What CARS Duel does (mechanical description)

**Scope:** End-to-end mechanics of the CARS Duel feature as implemented in this repository. This document describes behavior only; it does not evaluate pedagogy.

**Primary code:** `apps/learner-web/src/screens/CarsDuel.tsx`, `packages/ai-gateway/src/cars.ts`, `packages/authority-core/src/authority.ts` (`recordCarsDuel`), route `/app/cars` in `apps/learner-web/src/app/router.tsx`.

**Important distinction:** CARS Duel is **not** a passage-and-MCQ CARS practice session. It is a **live text debate with an AI sparring partner** on a short debate topic. Passage-based CARS content lives in a separate pipeline (`packages/cars-generation`) and is surfaced only on the reviewer route `/cars-preview`, not in the Duel.

---

## The learner's experience, step by step

### Entry points

1. **App nav tab** — label `"CARS Duel"`, links directly to `/app/cars` (`apps/learner-web/src/screens/AppShell.tsx`). There is no intermediate landing page; `CarsDuelHome.tsx` was removed (commit `a636739`).
2. **Today's Path** — activity kind `cars_duel`, title `"CARS Duel"`, navigates to `/app/cars` with `{ autostart: true, returnTo, activityId }` so the setup screen is skipped and the duel starts with defaults (`apps/learner-web/src/app/today-queries.ts`).
3. **Skill detail (CARS clusters CA1/CA2)** — card `"Start a CARS Duel"` linking to `/app/cars` (`apps/learner-web/src/screens/SkillDetail.tsx`).

### Phase 1 — Setup (`phase === 'setup'`)

The learner sees:

- **Heading:** `"Debate to sharpen your reasoning"`
- **Intro copy** (`CarsDuel.tsx`):

  > CARS Duel is a live, back-and-forth debate with an AI sparring partner — the fastest way to train the exact skill CARS tests: reading an argument closely and pressure-testing it. Choose how you want to spar, trade a few rounds on the topic below, and finish with a constructive reflection. No winner or loser, and it never counts toward mastery.

The learner **chooses**:

| Control | Options (user-facing labels) | Default |
| --- | --- | --- |
| **Mode** | `"Defend a thesis (the AI attacks)"` / `"Rebut the AI's argument (closest to real CARS)"` | Rebut |
| **Intensity** | `"Warm-up"` / `"Standard"` / `"Challenge"` | Standard |

The learner **does not choose** the topic. It is **system-assigned, read-only**, displayed under label `"Topic"`. The code holds three `SUGGESTED_TOPICS` but always uses index 0:

> Whether anonymous authorship strengthens or weakens a public argument

(The other two topics in the array are unused at runtime.)

**Primary action:** `"Start the duel"` (disabled while AI is busy or topic is empty).

### Phase 2 — Debating (`phase === 'debating'`)

**Header:** `CARS Duel · {Warm-up|Standard|Challenge} · round {n} of 4`

**Mode behavior:**

- **Rebut:** On start, the client sends a kickoff user message asking the AI to state its position; the first visible message is the AI's opening argument. The learner then rebutts.
- **Defend:** The log starts empty with hint: `"State your thesis to open — the AI will push back."` Placeholder: `"Your thesis…"` then `"Your rebuttal…"`.

Each learner turn:

1. Types in a textarea (`aria-label="Your argument"`).
2. Clicks `"Send argument"`.
3. Sees `"Opponent is thinking…"` while waiting.
4. AI reply appears labeled `"Opponent"`; learner messages labeled `"You"`.

**Round cap:** `MAX_ROUNDS = 4` user messages (`packages/ai-gateway/src/cars.ts`). After 4 rounds, the textarea is disabled and a callout reads:

> You've hit the round limit — wrap up with a reflection.

The learner may end earlier via `"End & get feedback"` (enabled once at least one user message exists).

**No passage is shown.** No multiple-choice questions appear. The debate is free-text on the topic string only.

### Phase 3 — Reflection (`phase === 'reflection'`)

Triggered when the learner clicks `"End & get feedback"`. The client requests a reflection message from the AI using `buildReflectionPrompt()`:

- `"Strongest point you made:"`
- `"Counter you left unanswered:"`
- `"CARS transfer tip:"`

**Screen copy:**

- Eyebrow: `"Duel reflection"`
- Heading: `"Nice sparring."`
- The reflection text is shown in a card.

Actions: `"New duel"` (resets to setup) or `"Back to plan"` / `"Back to Home"` depending on launch context.

### Duration

- **No in-app timer** and no pacing mechanic in `CarsDuel.tsx`.
- **Today's Path** budgets **12 fixed minutes** per duel activity (`packages/policies/src/todays-path.ts`: `costs.carsDuel: 12`). Actual time depends on how long the learner spends typing and waiting for AI responses (max 4 send-turns plus reflection/rubric calls).

### AI unavailable

If the AI proxy fails (missing key, network error), the learner sees:

- Heading: `"Your sparring partner is offline"`
- Callout: `"AI opponent not connected"` — instructs setting `AI_API_KEY` in `apps/learner-web/.env` and restarting the dev server.

---

## The duel mechanic, exactly

The **"duel"** is a **turn-based text debate against an AI sparring partner**. It is **not**:

- A scored competition (explicitly: *"No winner or loser"*)
- A race against a timer
- A comparison to the learner's past performance or another human
- A passage MCQ session

It **is**:

- An AI that holds or attacks a position on a debate topic, calibrated by **mode** (defend vs rebut) and **intensity** (warmup / standard / challenge)
- Bounded to **at most 4 learner turns** per session
- Ending in **constructive reflection**, not win/loss

The AI system prompt (`buildCarsSystemPrompt` in `packages/ai-gateway/src/cars.ts`) states its job is to *"sharpen the student's critical analysis and reasoning skills, not to win"*, debate *"reasoning and argument structure only"*, avoid fabricated facts/citations, and keep each turn to *"one short paragraph"* with *"at most one pointed question per turn"*.

**Model call limits:** `MAX_OUTPUT_TOKENS = 320` per turn; dev proxy caps at 320 tokens and keeps the last 20 messages (`apps/learner-web/vite.config.ts`).

---

## Passage sourcing and generation

### What the Duel uses

**No passages.** The Duel consumes a **debate topic string** only (currently always the first entry in `SUGGESTED_TOPICS`). No question-bank items, no generated passage sets, and no reading stimulus are loaded in `CarsDuel.tsx`.

### Where passages *do* exist (not in the Duel)

| Source | Role in product |
| --- | --- |
| **Question bank** (`content/question-bank/items/cars/`) | Used by **Adaptive Practice** and classification (`carsSkill` on items). Not wired to CARS Duel. |
| **`packages/cars-generation`** | LLM pipeline for passage+item sets from approved blueprints. **Not** called at runtime by the Duel. |
| **Hand-authored fixtures** | `EXAMPLE_SET`, `SKILL_SET`, `PERFORMANCE_SET` in `packages/cars-generation/src/fixtures/`. Used only by `/cars-preview`. |

### AI for the Duel (live chat)

| Setting | Value |
| --- | --- |
| Client | `HttpAiChat({ endpoint: '/api/ai/chat' })` |
| Dev proxy | Vite middleware in `apps/learner-web/vite.config.ts` |
| Env vars | `AI_API_KEY` (required), `AI_BASE_URL` (default `https://api.openai.com/v1`), `AI_MODEL` (default `gpt-4o-mini`) |
| Upstream | OpenAI-compatible `POST …/chat/completions` |

**Without `AI_API_KEY`:** proxy returns HTTP **503** `{ error: 'ai_not_configured' }`; client throws `AiUnavailableError`; UI shows the offline screen. The key is read **only at dev-server startup** (Vite `loadEnv`).

**Production note:** The AI proxy is a **dev-server middleware**. The production build does not embed this middleware; a deployed learner app would need an equivalent backend route for the Duel to function outside local dev (the client is written to hit a same-origin `/api/ai/chat` seam).

### AI for passage generation (separate tool)

`tools/cars-generator` runs `packages/cars-generation` pipeline with its own env (`AI_API_KEY`, `AI_MODEL`, `CARS_SOLVER_MODELS`, `CARS_ADJUDICATOR_MODEL`). This is **offline CLI tooling**, not the Duel runtime.

---

## Questions per passage

**CARS Duel serves zero MCQ questions and zero passages.**

For comparison elsewhere in the repo:

| Surface | Passages | Items |
| --- | ---: | ---: |
| Real MCAT CARS (documented in `packages/cars-generation/src/taxonomy.ts` `FORM_BLUEPRINT`) | 9 | 5–7 per passage |
| Existing bank corpus (user context) | 91 | ~1 median per passage |
| Generator preview fixtures (`/cars-preview`) | 3 | 5, 6, and 5 respectively (**16 total**) |
| **CARS Duel** | **0** | **0** |

The Duel exercises **written argument and rebuttal**, not passage-linked item answering.

---

## CARS skill taxonomy in code

### Official AAMC skill enum (`CarsSkill`)

Defined in `packages/contracts/src/vocab.ts`:

| Code | Title |
| --- | --- |
| `FOC` | Foundations of Comprehension |
| `RWT` | Reasoning Within the Text |
| `RBT` | Reasoning Beyond the Text |

Bank items tag `primary_skill` as `CARS_FOC` / `CARS_RWT` / `CARS_RBT`, resolved by `resolveCarsSkill()` in `packages/content/src/reasoning-operation.ts`. Practice queue items carry `carsSkill: CarsSkill | null` (`packages/authority-core/src/practice.ts`).

### What the Duel rubric uses (separate naming)

After reflection, the client optionally requests a **formative rubric** (`buildDuelRubricPrompt` / `parseDuelRubric` in `packages/ai-gateway/src/cars.ts`):

| Rubric criterion (AI-graded, 0–3) | Maps to `CarsSkill` | Authority update |
| --- | --- | --- |
| Position Identification | `FOC` | `score / 3` as observed `r` |
| Argument Evaluation | `RWT` | same |
| Application beyond the text | `RBT` | same |

Mapping is applied in `Authority.recordCarsDuel()` (`packages/authority-core/src/authority.ts`).

The rubric line is **never shown verbatim** to the learner; it is parsed server-side for ability nudges only.

### Richer taxonomy (generation / bank — not Duel UI)

`packages/cars-generation/src/taxonomy.ts` defines six **AAMC sub-skills** (e.g. `foc-comprehension`, `rwt-integration`, `rbt-new-information`) and `packages/cars-generation/src/archetypes.ts` defines ten **operational archetypes** (e.g. `central-thesis`, `author-attitude`, `principle-application`) explicitly marked as **[INFERENCE]**, not official AAMC names. These govern generated/bank MCQ items, not the Duel chat flow.

### Evidence grains written by the Duel

`recordCarsDuel` also writes **placement** evidence to synthetic grains `cars-ca1` and `cars-ca2` (skill clusters CA1/CA2), separate from the `FOC`/`RWT`/`RBT` IRT abilities.

---

## Feedback given

### During the debate

- **No right/wrong feedback** on individual turns.
- The opponent's replies are argumentative pushback only (per system prompt), not explanations of a keyed answer.

### At end of session

**Learner-visible:** One AI-generated **reflection** with three labeled sections (see Phase 3 above). The reflection prompt explicitly forbids declaring a winner or mentioning scores.

**Learner-invisible:** A second AI call grades the debate on the Position / Argument / Application rubric. Failures are swallowed (`catch { /* rubric grading is optional */ }` in `CarsDuel.tsx`); the duel still completes and records without rubric if grading fails.

There are **no** MCQ-style rationales, distractor refutations, or passage evidence quotes in the Duel — those exist only on generated/bank items (e.g. `/cars-preview` results).

---

## What is measured and persisted

### API

On reflection, `useRecordCarsDuel()` calls `POST /v1/hooks/cars-duel` with optional `{ rubric: { position?, argument?, application? } }` (`packages/client-core/src/http.ts`, `services/lambdas/learner-api/src/routes.ts`).

### Authority effects (`recordCarsDuel`)

1. **Evidence (contextual only):** Appends two `placement`-kind evidence records — one per cluster `CA1` and `CA2` — with `questionId: 'cars-duel'`, `correct: true`, `independent: false`, `familyId: 'fam-cars-duel'`. Comments in code: *"can never mint mastery"* because AI is in the loop.

2. **CARS IRT ability (formative):** If rubric scores present, updates `m.cars[FOC|RWT|RBT]` via `carsUpdate` with **`K = CARS_K_DUEL = 0.08`** (`packages/policies/src/cars.ts`). Observed result `r = score/3` per criterion.

3. **No BKT mastery** on KC grains from the Duel.

4. **No mistakes log entry** from the Duel path (unlike Practice / Passage of the Day attempts).

### Progress page

`CarsReadiness` on `/app/progress` reads `GET /v1/progress/cars` (`getCarsReadiness`): overall gauge plus three sub-skill bars for FOC/RWT/RBT. Comment in component: ability grows from **Passage of the Day** (stronger weight) and **CARS Duel** (gentler). Duel rubric nudges **do** feed this display when grading succeeds.

### Wrapped / activity tracking

Handler test confirms a completed duel contributes to Wrapped `skillsTouched` (includes `cars-ca1`, `cars-ca2`) but `protectedPassed: 0` (`services/lambdas/learner-api/src/handler.test.ts`).

### Idempotency

Duplicate `POST /v1/hooks/cars-duel` with the same command envelope returns the same accepted response without double-appending evidence.

---

## Timing and pacing

| Mechanism | Present in CARS Duel? |
| --- | --- |
| Countdown timer | **No** |
| Per-turn time limit | **No** |
| Round limit | **Yes** — 4 learner sends max |
| Exam-like ~10 min/passage pacing | **No** — no passages; Today's Path assumes **12 min** activity budget |
| Token cap per AI reply | **Yes** — 320 tokens |

`/cars-preview` mentions real CARS pacing (~10 min/passage) as guidance for reviewers only; that surface is untimed except elapsed-time reporting on finish.

---

## Generated content pipeline and where it surfaces

### `packages/cars-generation` output shape

`GeneratedPassageSet` (`packages/cars-generation/src/schema.ts`):

```text
{
  passage: { id, blueprintId, title, paragraphs[] },
  items: [{ id, archetype, skill, stem, choices[4], correctChoice, rationales, evidenceQuotes, … }],
  provenance: { model, generatedAt, pipelineVersion }
}
```

Pipeline version: `cars-gen-provisional-v1`. Status in `docs/design/cars-generation.md`: **provisional-v1**, candidates for human review only.

### Fixtures (hand-authored, not live LLM output)

| Set | Passage title | Items |
| --- | --- | ---: |
| `EXAMPLE_SET` | (cartography passage) | 5 |
| `SKILL_SET` | The Grammar of Skill | 6 |
| `PERFORMANCE_SET` | The Performer's Share | 5 |

**Total:** 3 passages, **16 items** — loaded by `CarsPreview.tsx` at `/cars-preview`.

### Where content surfaces

| Route | Audience | Mint evidence? | In Duel? | In Practice? |
| --- | --- | --- | --- | --- |
| `/app/cars` | Learners | Yes (duel hook only) | **This is the Duel** | — |
| `/cars-preview` | Reviewers | **No** | No | No |
| `/app/practice` | Learners | Yes (attempts) | No | Bank items (incl. `section: cars` when available) |

Generated/fixture passage sets are **not** reachable from the Duel or from Practice in the current codebase.

---

## Tests and pinned invariants

| Test file | What it pins |
| --- | --- |
| `packages/ai-gateway/src/ai-gateway.test.ts` | System prompt contains safety guardrails; reflection forbids winner/scores; rubric parser behavior |
| `packages/policies/src/mastery-bkt.test.ts` | `CARS_K_DUEL` moves ability less than `CARS_K_POTD`; `rubricToR` normalization |
| `packages/authority-core/src/authority.test.ts` | `recordCarsDuel` creates `cars-ca1`/`cars-ca2` placement evidence with cluster resolution |
| `packages/authority-core/src/practice-evidence-sequence.test.ts` | Duel evidence uses accepted sequence; placement records are contextual-only |
| `services/lambdas/learner-api/src/handler.test.ts` | `POST /v1/hooks/cars-duel` persists two `placement` evidence rows; Wrapped touch count; CSRF/session required |
| `services/lambdas/learner-api/src/postgres-api.integration.test.ts` | End-to-end cars-duel command accepts in Postgres-backed API |
| `packages/policies/src/todays-path.test.ts` | Daily plan includes `cars_duel` activities |

**No** component or E2E tests target `CarsDuel.tsx` directly.

---

## Incomplete or in-flux

| Item | Status |
| --- | --- |
| **`CarsDuelHome.tsx`** | **Removed** — tab goes straight to duel setup (`a636739`) |
| **Topic selection** | Three topics exist in code; UI shows **only the first**, read-only (`8caffc3`). Comment: *"The system picks the topic (for now, the first default)"* |
| **Intro copy** | Recently clarified to describe debate mechanics (`127b730`) |
| **SkillDetail CTA copy** | Still says *"Debate an AI opponent on a short passage or topic"* — **no passage is used** in the Duel |
| **AI in production** | Dev Vite proxy only; no lambda AI chat route found for deployed learner-api |
| **Passage generation** | `provisional-v1`; CLI/tooling only; not learner-facing except `/cars-preview` |
| **Passage of the Day** | Separate hook at `/app/passage`; uses a fixed science-bank item (`q-enz-passage-1`), not CARS Duel content |
| **Mastery claim** | Code and copy consistently state Duel **never counts toward mastery**; only low-weight CARS readiness nudge + contextual placement evidence |
| **Rubric grading** | Best-effort; optional; failure does not block reflection or recording |

---

## File index

| Path | Role |
| --- | --- |
| `apps/learner-web/src/screens/CarsDuel.tsx` | Duel UI and flow |
| `apps/learner-web/src/app/router.tsx` | `/app/cars`, `/cars-preview` |
| `packages/ai-gateway/src/cars.ts` | Prompts, rubric, constants |
| `apps/learner-web/vite.config.ts` | Dev AI proxy |
| `packages/authority-core/src/authority.ts` | `recordCarsDuel`, `getCarsReadiness` |
| `packages/policies/src/cars.ts` | IRT update constants |
| `packages/policies/src/todays-path.ts` | Daily `cars_duel` scheduling |
| `apps/learner-web/src/screens/CarsPreview.tsx` | Fixture review sitting |
| `packages/cars-generation/` | Passage/item generation (not Duel) |
