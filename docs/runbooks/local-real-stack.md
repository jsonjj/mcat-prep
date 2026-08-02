# Local real-stack runbook

## Purpose

Run the deployed learner API on your own machine, against a real Supabase project, so local
development and the deployment differ only in which Postgres they point at. Sign-in is real,
progress survives a restart, and every security rule the deployed API enforces is enforced here —
none of them is relaxed for local use.

`pnpm dev:offline` remains available and needs none of this. Use it when you want the app with no
account, no network, and no database.

## What runs where

| Piece                  | Local                                           | Deployed                       |
| ---------------------- | ----------------------------------------------- | ------------------------------ |
| App                    | Vite over **HTTPS** at `https://localhost:5173` | CloudFront                     |
| `/v1`                  | Vite proxy → `127.0.0.1:8790`                   | CloudFront → API Gateway       |
| Learner API            | `services/local-learner-api` (same handler)     | `services/lambdas/learner-api` |
| Configuration          | `.env.local`                                    | Secrets Manager                |
| Supabase signing keys  | fetched at startup                              | pinned at deploy time          |
| Learner data           | your Supabase Postgres                          | Aurora                         |
| Questions and passages | local corpus pull + compiled passage pool       | database                       |

Two consequences worth knowing before you start.

**The app is served over TLS.** The API only accepts HTTPS origins and only issues `__Host-`
cookies with `Secure`, exactly as deployed. Rather than add a dev exception, Vite serves the app
over HTTPS with a self-signed certificate so the origin genuinely is `https://localhost:5173`.

**Question content never reaches your Supabase project.** `question_protected` holds answer keys,
and a hosted database is the wrong place for them. The local API reads questions from the corpus
pull under `content/question-bank/.local/db-pull` and passages from the compiled pool, so the
database holds nothing but auth and learner state. Learner tables have no foreign key to
`questions`, so nothing breaks.

## Prerequisites

- The repo installed (`pnpm install`) on Node `>= 20.11`.
- A Supabase account. The free tier is enough.
- Optionally, a corpus pull at `content/question-bank/.local/db-pull/{questions,protected}.json`.
  Without it the local API falls back to the seven-question synthetic bank and says so at startup.

## Supabase project setup

1. Create a project. Note its **project ref** — the `abcdefghijklm` in
   `https://abcdefghijklm.supabase.co`.
2. **Settings → API keys**: copy the publishable (anon) key. It is public by design and ships in
   the client bundle.
3. **Authentication → URL configuration**: add `https://localhost:5173/auth/callback` to the
   redirect allowlist. Email confirmation links and the OAuth return both land there.
4. **Authentication → Sign in / Providers**: email is on by default. Enable Google if you want the
   Google button; it needs the same callback URL.
5. **Settings → JWT keys**: the project must be on asymmetric keys (ECC/RSA). A project still on
   the legacy shared HS256 secret publishes no JWKS, and the local API refuses to start against
   one — the deployed API refuses it too, so this is not a local restriction. Migrate the project
   there if the dashboard offers it.
6. **Connect** (top of the dashboard): copy a connection string. See
   [Which connection string](#which-connection-string) below.

## `.env.local`

Two files, both gitignored, both created by you.

### Repo root `.env.local` — the server side

```bash
# Required.
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
SUPABASE_PROJECT_REF=<ref>

# Optional, with the defaults shown.
DATABASE_SSL=no-verify           # require | no-verify | disable
LEARNER_WEB_ORIGIN=https://localhost:5173
PORT=8790
```

`ORIGIN_VERIFICATION_SECRET` and `RATE_LIMIT_PEPPER` are also read from this file, but you do not
have to invent them: `pnpm dev` generates both on first run, appends them here, and says so. They are written to the file rather than held in memory because the Vite proxy has to send
the same origin-verification secret this process expects, and a value that changed every restart
would mean reconfiguring the proxy every restart. If you do set them yourself,
`ORIGIN_VERIFICATION_SECRET` must be 64 characters of `[A-Za-z0-9_-]` and `RATE_LIMIT_PEPPER` 32 to
128 printable ones.

`DATABASE_SSL=no-verify` is the default here and nowhere else. The connection is still TLS; only
the certificate chain check is skipped, because Supabase's pooler certificate does not chain to a
root Node trusts out of the box. Download the project's CA from the dashboard and set
`DATABASE_SSL=require` if you would rather verify. The deployed runtime never reads this variable
and always verifies.

### `apps/learner-web/.env.local` — the browser side

```bash
VITE_AUTHORITY_BASE_URL=/
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

Both Supabase values are public. Without them the app falls back to the offline auth stand-in,
which posts to `/v1/dev-auth/*` — routes the real API does not serve — so Vite refuses to start in
this mode rather than let you find out at the sign-in form.

### Which connection string

Supabase offers three, and they are not interchangeable.

- **Transaction pooler**, port `6543`. The recommended default, and the one that works from any
  network. Every advisory lock the running app takes is transaction-scoped
  (`pg_advisory_xact_lock`), so it is safe here.
- **Session pooler**, port `5432` on the `pooler.supabase.com` host. Also fine, and a real session,
  so the migration advisory lock behaves normally.
- **Direct**, `db.<ref>.supabase.co`. IPv6-only unless you have bought the IPv4 add-on, which is
  usually why it appears to hang.

`pnpm db:migrate` notices a transaction pooler and skips the migration advisory lock, printing that
it did. It has to: that lock is session-scoped, and taken through a transaction pooler it would
land on an arbitrary backend and never be released. Skipping it is safe for a database only you
migrate — the deployed cluster is migrated by the attested Lambda, which keeps the lock. See
[database-migrations.md](./database-migrations.md).

## Running it

```bash
pnpm install
pnpm db:migrate    # safe to re-run; applies database/migrations
pnpm dev           # local learner API on 8790 + Vite on https://localhost:5173
```

The first `pnpm dev` writes the two generated secrets to `.env.local` before it starts anything,
so the API and the Vite proxy agree on them from the first run. Later runs are quiet.

Then open <https://localhost:5173>, accept the certificate warning once, and create an account.
Leave port 5173 free: the app works on another port, but `LEARNER_WEB_ORIGIN` and the redirect
allowlist both name 5173, so an OAuth return would come back to the wrong place.

`pnpm db:migrate` is safe to re-run: the runner records each file's checksum in
`authority_schema_migrations`, skips what is already applied, and refuses to proceed if an applied
file has since been edited. Every migration is compatible with a database that has no
`mcat_learner_api` or `mcat_workers` role — the grants are guarded by
`if exists (select 1 from pg_catalog.pg_roles ...)` — so nothing needs superuser on Supabase.

## Troubleshooting

**"Your connection is not private" / `NET::ERR_CERT_AUTHORITY_INVALID`.** Expected. The certificate
is self-signed by `@vitejs/plugin-basic-ssl`. Accept it once per browser profile. It is what makes
the origin genuinely HTTPS, which is what lets the API keep its production origin and cookie rules.

**The first request after a break takes ten seconds, or the API fails to boot with a connection
timeout.** Free-tier Supabase pauses an idle database. The local API waits 30 seconds for the first
connection for exactly this reason; if it still fails, open the dashboard to wake the project and
start again. A project paused for a week may need to be resumed by hand.

**Every `/v1` call returns 403.** The Vite proxy and the API disagree about
`ORIGIN_VERIFICATION_SECRET`. Both read it from the repo-root `.env.local`, and Vite reads it once
at startup, so restart Vite after the value changes.

**Vite exits with "VITE_AUTHORITY_LOCAL is set but ORIGIN_VERIFICATION_SECRET is not."** You started
Vite directly rather than through `pnpm dev`, which is what generates the secret first. Run
`pnpm --filter @mcat/local-learner-api run ensure-env` once, or just use `pnpm dev`.

**Sign-in returns 401 with nothing in the API log about the token.** The token is being rejected
before it is trusted. Check that `VITE_SUPABASE_URL` and `SUPABASE_PROJECT_REF` name the _same_
project: the API verifies the issuer against the JWKS it fetched at startup.

**Startup fails with "That project published no signing keys."** The project is still on the legacy
shared JWT secret. Migrate it under Settings → JWT keys.

**`EADDRINUSE` on 8790.** A previous run is still up. `lsof -ti :8790 | xargs kill`, or set `PORT`.

**Practice shows the same handful of enzyme questions.** There is no corpus pull on this machine;
the startup line says so. Everything else works — only Practice is thin.

**You want the old behaviour back.** `pnpm dev:offline` is the previous `pnpm dev`: in-process
authority, in-memory storage, dev auth stand-in with its clickable email links on the _Check your
email_ screen, no database and no Supabase.

## Rotating Supabase signing keys

The local API fetches the JWKS at startup, so a rotation takes effect on the next restart with no
action. The deployed API pins them, so it needs `pnpm supabase:sync-jwks <project-ref>` — see the
README's sign-in section.
