# ADR 0001: Browser-first delivery, native/desktop deferred

- **Status:** Accepted
- **Date:** 2026-07-20

## Context

The PRD originally assumed a React Native / Expo-first client. The product owner overrode the delivery order: build and finalize a responsive **browser website / PWA** first (usable on mobile browsers), then convert the shared product core into a downloadable iOS app and a downloadable desktop app.

## Decision

1. The initial client is a Vite + React Router (framework mode, `ssr: false`) responsive website with PWA support in [`apps/learner-web`](../../apps/learner-web).
2. Administration is a separate browser app in [`apps/admin-web`](../../apps/admin-web).
3. Reusable product logic is extracted into platform-neutral packages (`contracts`, `domain`, `policies`, `content`, `client-core`, `learner-core`, `scene-core`, `design-tokens`) that import no DOM, browser, or native APIs. Browser specifics live only in `platform-web`, `ui-web`, `scene-web`, and the apps.
4. `packages/ui-web` must not import router modules; route files stay thin so a later Tauri desktop shell can reuse the same DOM UI.
5. AWS authority, Cognito, and offline/event semantics from the PRD remain binding.
6. Native iOS (Expo) and desktop (Tauri) are **Phases 13–14**, gated behind a signed web-finalization manifest. Their directories are documented but not scaffolded yet.

## Consequences

- Best initial web quality, accessibility, SEO for public routes, browser offline control, and later desktop reuse.
- The later iOS presentation layer is rebuilt in React Native, but domain/policy/contract/sync logic is shared.
- Precedence order: latest owner instruction → this plan → PRD → Brain Lift rationale → visual reference.
