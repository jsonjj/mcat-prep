# ADR 0002: Toolchain and monorepo layout

- **Status:** Accepted
- **Date:** 2026-07-20

## Decision

- **Monorepo:** pnpm workspaces + Turborepo.
- **Language:** TypeScript in strict mode (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- **Validation:** Zod at every trust boundary; shared DTOs in `@mcat/contracts`.
- **Web build:** Vite; routing via React Router 7 framework mode with SSR disabled and selective static prerendering for public routes.
- **State:** Zustand (small local UI state) + TanStack Query (server state).
- **Tests:** Vitest + React Testing Library + jest-axe (unit/component/a11y); Playwright (browser E2E, added with the app phases).
- **Lint/format:** ESLint (flat config, typescript-eslint) + Prettier.

## Pinned versions (scaffold time)

| Tool | Version |
|---|---|
| Node | >= 20.11 (dev on 24) |
| pnpm | 9.15.9 |
| TypeScript | 5.7.3 |
| Vite | 6.x |
| React | 18.3.x |
| React Router | 7.x |
| Vitest | 2.1.x |
| Zod | 3.24.x |
| ESLint | 9.x |

## Sandbox / environment note

The build environment restricts writes to the workspace directory (no `$HOME` writes). Consequences captured here so future maintainers don't rediscover them:

- Corepack cannot symlink pnpm into the global Node bin. pnpm is instead installed workspace-locally under `.tooling/` and invoked directly, or provisioned normally in a real dev/CI environment.
- npm/pnpm caches and the pnpm store are redirected into the workspace via `.npmrc` (`store-dir`, `cache-dir`, `state-dir`) and `NPM_CONFIG_CACHE`.
- Git metadata writes require elevated permission in the sandbox; commits are made deliberately, not implicitly.

These are environment accommodations, not product decisions; a provisioned environment can use a global pnpm.
