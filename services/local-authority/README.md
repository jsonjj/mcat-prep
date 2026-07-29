# @mcat/local-authority

The local development harness for the authority. Two entry points:

- `src/in-process.ts` — an in-process `AuthorityPort` over the synthetic bank, for deterministic tests and offline UI work.
- `src/http-server.ts` — a loopback-only HTTP server that runs the **real** server runtime (`RepositoryLearnerKernel` over `InMemoryAuthorityRepository`), so the browser exercises the same code path the deployed Lambda does.

Start it on its own, or alongside the learner web app:

```bash
pnpm --filter @mcat/local-authority run dev   # 127.0.0.1:8787, override with LOCAL_AUTHORITY_PORT
pnpm run dev:lesson                           # the same server plus learner-web on :5173
```

State lives in memory. Restarting the server resets the learner.

## `GET /v1/debug/learner-state` — local inspection

A read-only projection of everything the lesson → evidence → mastery seam writes, so
"did the lesson actually move mastery" is answerable by hand and not only from the
test suite.

**This route exists only in this package**, and each thing that keeps it that way is
asserted in `tests/architecture/lesson-mastery-integration.test.ts`, under the describe
block "the local debug route never reaches the deployed lambda":

| What is asserted                                                                                                                            | Assertion                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `services/lambdas/learner-api` declares no dependency on `@mcat/local-authority`, in any of the four dependency fields.                     | "does not declare the local-authority package as a dependency"          |
| No deployed lambda source imports that package — by bare specifier or by relative path — nor any `debug-state` module.                      | "does not import the local-authority package or its debug module"       |
| The lambda's real `ROUTES` table registers no path matching `/debug/`.                                                                      | "registers no debug route in the deployed route table"                  |
| No deployed lambda source even names `DEBUG_LEARNER_STATE_PATH`, so an unrouted handler branch cannot sit ready.                            | "does not mention the debug route path anywhere in the deployed source" |
| `src/index.ts` re-exports neither `./debug-state` nor `./http-server`, so importing this package cannot reach the route-registering module. | "keeps the debug projection out of the local-authority package surface" |

The bans are independent, so no single edit re-opens the route, and they read `ROUTES`
and `DEBUG_LEARNER_STATE_PATH` from production code rather than matching source text, so
renaming either fails the assertion instead of silently voiding it. A calibration case
first checks that the route table is non-empty and that `routes.ts` was actually scanned,
so a ban cannot pass by finding nothing.

Do not add a sentence here about whether a test exists. That sentence has been wrong in
both directions already — it claimed a guard that did not exist, and then denied one that
did. Name the assertions, or say nothing.

### Three independent guards, all required

| Guard           | Requirement                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Explicit opt-in | `MCAT_LOCAL_DEBUG_STATE` must be `1` or `true` (an allowlist — `on`, `yes` and every other value are off). Read once at startup. |
| Loopback peer   | The connection's remote address must be exactly `127.0.0.1`, `::1` or `::ffff:127.0.0.1`.                                        |
| No `Origin`     | Any request carrying an `Origin` is refused. This is a command-line view; every browser `fetch` sets that header.                |

None is sufficient alone and the default is off. When any fails the server answers
`404 {"error":"Route not found."}` — byte-identical to an unknown path, so the route's
existence is not observable without all three. The response never carries CORS headers,
so even a widened origin allowlist cannot turn into a way for a page to read it.

Two transport-level guards sit in front of every route, debug or not:

- **`Host` allowlist.** The header must name this server (`127.0.0.1`, `localhost` or
  `[::1]`) on the bound port, else `403 {"error":"Host is not allowed."}`. A loopback
  bind is no defence against DNS rebinding — a page whose hostname resolves to
  `127.0.0.1` reaches the socket, and its same-origin GET carries no `Origin` at all.
- **Exact origin allowlist.** `http://127.0.0.1:5173` and `http://localhost:5173` only,
  not `http://localhost:<any port>`. Credentialed CORS plus a port wildcard let a page
  on any other local port read learner state. If Vite picks a different port, set
  `LOCAL_AUTHORITY_ALLOWED_ORIGINS` to a comma-separated list of whole origins.

### Response

```jsonc
{
  "schema": "debug-learner-state/v1",
  "learnerId": "…",
  "streamVersion": 18,
  "acceptedEventCount": 18, // accepted commands; always equals streamVersion
  "now": "2026-07-28T03:11:56.938Z",
  "masteryThreshold": 0.95,
  "knowledgeComponents": [
    // only KCs that hold a persisted state
    {
      "kcId": "V3-KC-866848",
      "pL": 0.31,
      "storedPL": 0.31,
      "atCapabilityCut": false,
      "reviewDue": false,
      "halfLifeDays": 7,
      "lastPracticedAt": "…",
    },
  ],
  "reasoningOperations": [
    // always all 7; `observed` false means `pL` is the prior
    { "operation": "IDENTIFY", "pL": 0.2, "atCapabilityCut": false, "observed": false },
  ],
  "lessons": [
    // DERIVED — a lesson holds no P(L) of its own
    {
      "lessonId": "V3-LES-130923",
      "status": "available",
      "pL": 0.2,
      "mastered": false,
      "reviewDue": false,
      "requiredKcCount": 3,
      "weakestKcId": "V3-KC-866848",
      "weakestPL": 0.2,
      "members": [{ "kcId": "…", "pL": 0.2, "mastered": false, "reviewDue": false }],
    },
    {
      "lessonId": "lesson-enz-inhibition",
      "status": "unavailable",
      "rejectionCodes": ["LESSON_KC_MAP_MISSING"],
      "missingKcIds": [],
    },
  ],
  "evidence": [
    // allowlisted fields only
    {
      "evidenceId": "…",
      "skillId": "…",
      "cluster": "…",
      "kind": "independent",
      "outcome": "correct",
      "independent": true,
      "assistanceLevel": "A0",
      "contentBearingHint": false,
      "valid": true,
      "changeDimensions": [],
      "conditions": { "mixed": false, "passage": false, "timed": false, "protected": false },
      "occurredAt": "…",
      "sequence": 3,
    },
  ],
  "appliedObservationCount": 0, // re-delivering an accepted response must not raise this
  "highestAppliedObservationSequence": null, // null until the first observation lands
  "practicedLessonIds": [],
}
```

Notes on reading it:

- **`pL` is decayed to `now`; `storedPL` is the value as-of `lastPracticedAt`.** They differ once time has passed.
- **`atCapabilityCut` is not `mastered`.** On a KC or a reasoning operation it means only that `pL >= masteryThreshold`. The mastery **claim** appears on a lesson and its members, where the evidence warrant is also available; a grain can sit at `pL = 1` and never be mastered. The two used to share the name `mastered`, and this view then disagreed with the lesson rollup one field away.
- **A lesson never reports a fabricated number.** Every required KC of a reported lesson is supplied explicitly — an unstarted one at the prior — so a partly-started lesson rolls up over its **whole** membership rather than over the subset that happens to have moved. `mastered` needs every member at or above the threshold **and** adequately warranted, so one weak KC — or one unwarranted one — is deliberately not mastery.
- **`unavailable` is a real answer, not "no data".** `LESSON_KC_MAP_MISSING` means the lesson id resolves to no curriculum membership (the synthetic dev lesson `lesson-enz-inhibition` legitimately does this); `LESSON_KC_STATE_MISSING` names the uncovered KC ids. Neither is the same as a lesson sitting at the prior.
- **No protected material.** Evidence is projected through an explicit field allowlist, so answer keys, rationales, scoring authority refs, item stems and item ids are structurally absent. Assume this response gets logged; it is safe to paste into an issue.

### Manual verification loop

The harness lesson `V3-LES-130923` is always reported, whether or not it has been
started, so there is a baseline to diff against.

```bash
# 1. Start the harness with the opt-in (authority on :8787, learner-web on :5173).
MCAT_LOCAL_DEBUG_STATE=1 pnpm run dev:lesson

# 2. In a second terminal, take a baseline before touching the lesson.
mkdir -p .tmp/scratch
curl -s http://127.0.0.1:8787/v1/debug/learner-state | jq . > .tmp/scratch/before.json
jq '{acceptedEventCount, appliedObservationCount, practicedLessonIds,
     kcs: .knowledgeComponents, lesson: .lessons[0]}' .tmp/scratch/before.json

# 3. Run the lesson in the browser and answer at least one question.
open http://127.0.0.1:5173/app/lessons/vectors-and-trigonometry

# 4. Take the after picture and diff it.
curl -s http://127.0.0.1:8787/v1/debug/learner-state | jq . > .tmp/scratch/after.json
diff .tmp/scratch/before.json .tmp/scratch/after.json
```

What to expect:

- **Baseline.** `knowledgeComponents` empty, all seven operations `observed: false` at the prior `0.2`, `V3-LES-130923` `available` with three members at `0.2`, `appliedObservationCount: 0`, `acceptedEventCount: 0`.
- **Every accepted command.** `acceptedEventCount` and `streamVersion` each rise by one and stay equal. If they diverge, the projection and the command log disagree — that is a real bug.
- **When a response qualifies for BKT.** The primary KC appears in `knowledgeComponents` with a `pL` away from `0.2`, its primary reasoning operation flips to `observed: true`, `appliedObservationCount` rises by one, `practicedLessonIds` gains the lesson id, and the lesson's mean `pL` rises — held down by the two members still at the prior, which is the rollup working correctly, not a bug.
- **Replaying the same response.** `appliedObservationCount` and every `pL` stay put; qualified observations are idempotent on `observationId`. `highestAppliedObservationSequence` is the ordering watermark — an observation arriving at or below it was applied out of order.
- **An answer that does not move anything is often correct.** Lesson exits are instructional-only unless the binding declares an eligible evidence mode _and_ the attempt was actually administered that way, so a `knowledgeComponents` that stays empty after a normal lesson exit is the policy holding, not a broken pipe. Check `appliedObservationCount` to tell "nothing qualified" apart from "nothing arrived".

To confirm the guards rather than the payload:

```bash
# Opted in, loopback, no Origin → 200.
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/v1/debug/learner-state

# Pretending to be a page → 404 (allowlisted origin) or 403 (anything else).
curl -s -H 'Origin: http://127.0.0.1:5173' http://127.0.0.1:8787/v1/debug/learner-state
curl -s -H 'Origin: http://localhost:31337' http://127.0.0.1:8787/v1/debug/learner-state

# A rebound hostname → 403 on every route, debug or not.
curl -s -H 'Host: attacker.example.com' http://127.0.0.1:8787/v1/debug/learner-state

# Restart without the opt-in → 404, identical to any unknown path.
pnpm --filter @mcat/local-authority run dev
curl -s http://127.0.0.1:8787/v1/debug/learner-state   # {"error":"Route not found."}
curl -s http://127.0.0.1:8787/v1/definitely-not-a-route # {"error":"Route not found."}
```
