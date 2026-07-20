# Implementation status

Snapshot of what is built and verified versus what remains. Verification gates that pass today: `eslint` clean, `turbo run typecheck` 13/13, `vitest` 42/42, protected-content scan OK, `learner-web` + `admin-web` Vite builds green, and the built learner app serves (index/JS/manifest/SW all 200).

## Built and verified

| Area | Package(s) | Status |
|---|---|---|
| Monorepo + toolchain | root, tsconfig, eslint, turbo, vitest | Done |
| Governance & design docs | `docs/**` | Done (ADRs, authority boundaries, threat model, data inventory, public-claims freeze, question-format guide, frontend-design brief, skills lock) |
| Contracts | `@mcat/contracts` | Done — ids/time/versioning/errors, controlled vocabulary, immutable events, sync DTOs |
| Domain | `@mcat/domain` | Done — evidence model, reason codes, skill-graph + cycle detection, scoring, mastery ladder, tasks |
| Learning policies (provisional-v1) | `@mcat/policies` | Done — FSRS-4.5, assistance fading, balanced diagnostic routing, mastery recipes + freshness, planner capacity/ordering, readiness + gated prediction |
| Design system | `@mcat/design-tokens`, `@mcat/ui-web` | Done — light/dark tokens, accessible primitives, MasteryBadge (non-color-redundant) |
| Content system | `@mcat/content`, `content/`, `tools/content-cli` | Done — schemas, safe/protected compilation, validation, synthetic BB1 bank, folder contract, CLI, generated JSON Schemas |
| Authority engine | `@mcat/authority-core` | Done — guest/bootstrap, placement, Today, full study loop (Diagnose-Before-Reveal, transfer, passage, simulation, protected, recall), evidence + mastery |
| Client seam + platform | `@mcat/client-core`, `@mcat/platform-web` | Done — AuthorityPort, in-process adapter, localStorage store, capabilities |
| Learner website | `apps/learner-web` | Done (web) — onboarding, Home/Today/Study/Recall/Mistakes/Progress/Skills/Profile, PWA shell |
| Admin console | `apps/admin-web` | Shell — coverage, library, empty-bank, server-only keys |
| Architecture guards | `tests/architecture`, `tools/scanners` | Done — boundary + protected-payload + copyright scans |

## Remaining / intentionally gated

| Plan phase | What remains | Why not now |
|---|---|---|
| Phase 4 — AWS authority | CDK stacks, Aurora/RDS Proxy, Cognito, API Gateway/Lambda, S3, Step Functions publication, sync API, export/deletion, analytics lake, Web Push | Requires AWS org/accounts/credentials + operations `GO` (external). Local authority stands in via ADR 0004; the `AuthorityPort` swap is an adapter change. |
| Phase 5 — full breadth | Real content beyond the synthetic BB1 slice; calibrated MD-CAT in shadow | Depends on the content program + calibration data. |
| Phase 6 — 3D brain | Segmented WebGL brain (`scene-web`) with camera/quality tiers | 2D Evidence Atlas + list route ship now; 3D asset is long-lead. |
| Phase 7 — hooks | CARS Duel, Passage of the Day, Wrapped, past-self Ghost, companion/avatar, Focus mode, notifications | Authored-content + feature-flag layer; not yet built. |
| Phase 8 — content program | Full original, reviewed, calibrated curriculum/bank | Human-led SME/psychometric program (9–15+ months). |
| Phase 9 — deferred features | Bring Your Deck, live AI, speech, social/normative Ghost, expanded sims | Provider evaluation + consent + governance gates. |
| Phase 10 — validation | Calibrated MD-CAT/mastery/readiness/score-prediction activation | Requires consented outcomes + psychometric validation; numeric prediction stays off. |
| Phases 11–12 — hardening/rollout | Pen test, full a11y/device matrix, load/chaos, staged cohorts, observability | Follows a deployed environment. |
| Phases 13–14 — native/desktop | Expo iOS + Tauri desktop from the shared core | After signed web finalization. |

## Local development

```bash
pnpm install
pnpm run verify                 # lint + typecheck + test + protected scan
pnpm --filter @mcat/learner-web dev
pnpm --filter @mcat/admin-web dev
pnpm --filter @mcat/content-cli start manifest
```

Sandbox note: this environment restricts `$HOME` writes; see ADR 0002 for pnpm/cache/TMPDIR accommodations that a normal dev environment does not need.
