# Question bank (content-only)

This tree is **data**, not application code. Adding, correcting, or retiring content must never require editing a screen, route, scoring function, or mastery rule.

```
content/question-bank/
  schema/         Generated JSON Schemas (source of truth is Zod in @mcat/content)
  templates/      What the team copies and fills in (CSV + JSON)
  items/          Canonical per-question JSON, one file per question, by section
    cp/  cars/  bb/  ps/
  stimuli/        Shared passages/experiments/figures referenced by questions
  media/          Original/licensed media metadata (with required alt text)
  imports/inbox/  Team spreadsheet exports (UTF-8 CSV) or bulk JSONL
  reports/        Generated validation & coverage reports (never authored source)
```

## Rules

- The production bank starts **empty**. The app boots to a safe "Question Bank Not Loaded" state and keeps learner question flows locked until a valid, reviewed bank is published.
- One canonical JSON file per question under `items/<section>/<question-id>.json`.
- CSV and JSONL are intake formats; after validation the converter produces the same canonical JSON.
- Answer keys and rationales are compiled **server-only** (`@mcat/content` `compileQuestion`); they never ship in a learner-safe payload.
- Synthetic/test-only fixtures live in `@mcat/content` (namespaced, `test_only: true`) and are **rejected** by production publication.

## Tooling

```bash
pnpm --filter @mcat/content-cli start -- manifest            # synthetic bank manifest
pnpm --filter @mcat/content-cli start -- validate content/question-bank/items
pnpm --filter @mcat/content-cli start -- schemas             # (re)generate schema/*.json
```

## Copyright

Never place reference PDFs, screenshots, OCR text, or any derivative of copyrighted source questions here. All content is original or licensed with recorded provenance and rights. See `docs/content/question-format-guide.md`.
