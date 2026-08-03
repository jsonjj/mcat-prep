# Question corpus — source, vendoring, and seeding

The v7 question corpus (the ~2,108-item MCAT practice bank) is **answer-bearing**
(it carries correct answers, per-choice explanations, and misconceptions) and large.
It is therefore **intentionally NOT vendored into git**. It lives in the LOCAL-ONLY
archive outside the repo (the `..._LOCAL_ONLY_DO_NOT_PUSH_...` sibling directory) and
is only ever **read** by the tooling below.

Instead of committing the corpus, the repo commits:

- `corpus.manifest.json` — a small, non-sensitive manifest (source filename, counts,
  the pinned V3 `registry_sha256`, and the env vars used to locate the corpus).
- The generated curriculum/cluster maps in `@mcat/content`
  (`packages/content/src/data/*`), which are structural IDs only (no prose, no keys).

## Locations

| What | Path | Tracked? |
| --- | --- | --- |
| Raw v7 JSONL corpus | `$MCAT_V7_CORPUS_PATH`, or (default) `content/question-bank/.local/v7-corpus/generated-v7-dok-dynamic-final.jsonl` | No (gitignored / external) |
| Compiled pull (learner-safe + protected) | `content/question-bank/.local/db-pull/{questions,protected}.json` | No (gitignored) |

Everything under `content/question-bank/.local/` is gitignored — never commit it.

## Configurable paths (no hardcoded absolute paths)

Tooling resolves the corpus from env, so the same command runs on any machine / in CI:

- **`MCAT_V7_CORPUS_PATH`** — absolute, or relative to the repo root. Used by
  `@mcat/content-cli` (`load-v7`, `db-seed`) to read the raw v7 JSONL. If unset it
  falls back to the gitignored default above; if the file is missing the command
  fails loudly with this file referenced.
- **`MCAT_QUESTION_CORPUS_DIR`** — directory containing the compiled `questions.json`
  + `protected.json`. Used by `pnpm questions:seed` / `pnpm content:seed`. Defaults to
  `content/question-bank/.local/db-pull`.

## Producing the compiled pull

```bash
# Validate + compile the raw v7 JSONL into the gitignored local bundle:
MCAT_V7_CORPUS_PATH=/abs/path/to/generated-v7-dok-dynamic-final.jsonl \
  pnpm --filter @mcat/content-cli start load-v7
```

## Referential-integrity guard

Every question's `kc_id` / `lesson_id` must resolve against the in-repo V3 curriculum
(`@mcat/content`). Scan an existing corpus/pull without writing anything:

```bash
pnpm questions:scan                       # scans the local db-pull (skips if absent)
MCAT_QUESTION_CORPUS_DIR=/some/dir pnpm questions:scan
```

The guard also runs automatically on every `questions:ingest` and `content:seed`.

## Seeding Postgres (idempotent, run AFTER migrations)

```bash
# Prod (or any target). Migrations must already be applied.
export DATABASE_URL='postgres://…'                 # Session pooler / RDS Proxy URL
export MCAT_QUESTION_CORPUS_DIR=/abs/path/to/db-pull   # optional; defaults to the local pull
pnpm content:seed                                  # questions + passages, both upserts

# Or seed each half independently:
pnpm questions:seed
pnpm passages:seed
```

`content:seed` is idempotent (every row is an upsert by id), so re-running it is safe.

## Dev `DATABASE_URL` parity note

The Vite dev server does **not** auto-load the repo-root `.env`. To make the dev
server (and these CLIs) talk to Postgres, export `DATABASE_URL` in the **same shell**
that runs the command (or set it in `apps/learner-web/.env.local`). Without it, the
dev practice bank falls back to the local pull, and Passage of the Day falls back to
the local store / hardcoded pool — see `apps/learner-web/server/practice-bank-source.ts`
and `apps/learner-web/server/passage-pool-source.ts`.
