import { Suspense, lazy, type ReactElement, type ReactNode } from 'react';
import { Link, Navigate, createBrowserRouter, useRouteError } from 'react-router-dom';
import { Card, Eyebrow, Stack } from '@mcat/ui-web';
import { RequireAuth } from './RequireAuth';
import { AppShell } from '../screens/AppShell';
// Curriculum, VectorLesson and CatalogLesson stay STATIC named imports on
// purpose: the architecture contracts (curriculum-ui-contract,
// vector-lesson-ui-contract, catalog-lesson-routes-contract) pin these exact
// import shapes in this file, and the lesson runtime must line up with its
// renderer. Every other screen is code-split via React.lazy below.
import { Curriculum } from '../screens/Curriculum';
import { VectorLesson } from '../screens/VectorLesson';
import { CatalogLesson } from '../screens/CatalogLesson';
import { DIAGNOSTIC_ENABLED, PRACTICE_TEST_ENABLED } from './capabilities';

// Route-level code-splitting: every screen below is fetched on demand, so the
// initial bundle carries only the shell, the auth guard, and the three
// contract-pinned lesson screens above — not the 3D Home atlas, the whole
// practice/recall stack, or the gated diagnostic (which prod never loads at all).
// Each lazy element renders under the shared <Suspense> fallback via `suspense()`.
const Homepage = lazy(() => import('../screens/Homepage').then((m) => ({ default: m.Homepage })));
const OnboardingStart = lazy(() =>
  import('../screens/OnboardingStart').then((m) => ({ default: m.OnboardingStart })),
);
const SignIn = lazy(() => import('../screens/auth/SignIn').then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import('../screens/auth/SignUp').then((m) => ({ default: m.SignUp })));
const AuthCallback = lazy(() =>
  import('../screens/auth/AuthCallback').then((m) => ({ default: m.AuthCallback })),
);
const CheckEmail = lazy(() =>
  import('../screens/auth/CheckEmail').then((m) => ({ default: m.CheckEmail })),
);
const ForgotPassword = lazy(() =>
  import('../screens/auth/ForgotPassword').then((m) => ({ default: m.ForgotPassword })),
);
const Diagnostic = lazy(() =>
  import('../screens/Diagnostic').then((m) => ({ default: m.Diagnostic })),
);
const PlanSetup = lazy(() => import('../screens/PlanSetup').then((m) => ({ default: m.PlanSetup })));
const Home = lazy(() => import('../screens/Home').then((m) => ({ default: m.Home })));
const TodaysPath = lazy(() =>
  import('../screens/today/TodaysPath').then((m) => ({ default: m.TodaysPath })),
);
const RecallHome = lazy(() =>
  import('../screens/recall/RecallHome').then((m) => ({ default: m.RecallHome })),
);
const RecallReview = lazy(() =>
  import('../screens/recall/RecallReview').then((m) => ({ default: m.RecallReview })),
);
const CardBrowser = lazy(() =>
  import('../screens/recall/CardBrowser').then((m) => ({ default: m.CardBrowser })),
);
const CardEditor = lazy(() =>
  import('../screens/recall/CardEditor').then((m) => ({ default: m.CardEditor })),
);
const ImportApkg = lazy(() =>
  import('../screens/recall/ImportApkg').then((m) => ({ default: m.ImportApkg })),
);
const Mistakes = lazy(() => import('../screens/Mistakes').then((m) => ({ default: m.Mistakes })));
const MistakesRepair = lazy(() =>
  import('../screens/mistakes/MistakesRepair').then((m) => ({ default: m.MistakesRepair })),
);
const Progress = lazy(() => import('../screens/Progress').then((m) => ({ default: m.Progress })));
const SkillDetail = lazy(() =>
  import('../screens/SkillDetail').then((m) => ({ default: m.SkillDetail })),
);
const Profile = lazy(() => import('../screens/Profile').then((m) => ({ default: m.Profile })));
const PassageOfDay = lazy(() =>
  import('../screens/PassageOfDay').then((m) => ({ default: m.PassageOfDay })),
);
const PracticeHome = lazy(() =>
  import('../screens/practice/PracticeHome').then((m) => ({ default: m.PracticeHome })),
);
const PracticeSession = lazy(() =>
  import('../screens/practice/PracticeSession').then((m) => ({ default: m.PracticeSession })),
);
const PracticeTest = lazy(() =>
  import('../screens/practice/PracticeTest').then((m) => ({ default: m.PracticeTest })),
);
const CarsDuel = lazy(() => import('../screens/CarsDuel').then((m) => ({ default: m.CarsDuel })));
const Wrapped = lazy(() => import('../screens/Wrapped').then((m) => ({ default: m.Wrapped })));
const CarsPreview = lazy(() =>
  import('../screens/CarsPreview').then((m) => ({ default: m.CarsPreview })),
);

/** Calm, shell-friendly fallback shown while a lazy route chunk loads. */
function RouteFallback() {
  return <div className="mc-center mc-muted">Loading…</div>;
}

/**
 * Wrap a lazy element in the shared Suspense boundary. The boundary lives inside
 * each route element, so a chunk loading inside `/app` shows the fallback in the
 * main area while the shell (nav + header) stays put.
 */
const suspense = (node: ReactNode): ReactElement => (
  <Suspense fallback={<RouteFallback />}>{node}</Suspense>
);

/**
 * Router-level error boundary. React Router renders this in place of any route
 * whose element render or loader throws, so one broken screen shows a calm
 * recovery page instead of a blank app. The root <ErrorBoundary> in main.tsx is
 * the outer net for anything above or outside the routed tree.
 */
function RouteError() {
  const error = useRouteError();
  console.error('Route error:', error);
  return (
    <div className="mc-onboarding" role="alert">
      <Card elevated>
        <Stack gap={4}>
          <Eyebrow>Something went wrong</Eyebrow>
          <h1 className="mc-h2">This page hit an unexpected error.</h1>
          <p className="mc-muted">
            You can head back to the start and try again — your saved progress is safe.
          </p>
          <Link className="mc-button mc-button--primary mc-button--lg mc-linkbtn" to="/">
            Back to start
          </Link>
        </Stack>
      </Card>
    </div>
  );
}

/** Styled 404 for any URL that matches no route, with a link home. */
function NotFound() {
  return (
    <div className="mc-onboarding">
      <Card elevated>
        <Stack gap={4}>
          <Eyebrow>Page not found</Eyebrow>
          <h1 className="mc-h2">We couldn’t find that page.</h1>
          <p className="mc-muted">
            The link may be old or mistyped. Everything else is right where you left it.
          </p>
          <Link className="mc-button mc-button--primary mc-button--lg mc-linkbtn" to="/">
            Go home
          </Link>
        </Stack>
      </Card>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    // A pathless root route gives every descendant one shared error boundary and
    // hosts the catch-all 404 below, without changing any child's own path.
    errorElement: <RouteError />,
    children: [
      // Public: the marketing homepage and the four credential screens. Everything
      // else sits behind RequireAuth, because every other surface reads or writes
      // learner evidence and the authority now refuses those without a linked session.
      { path: '/', element: suspense(<Homepage />) },
      { path: '/signin', element: suspense(<SignIn />) },
      { path: '/signup', element: suspense(<SignUp />) },
      { path: '/check-email', element: suspense(<CheckEmail />) },
      { path: '/forgot-password', element: suspense(<ForgotPassword />) },
      // Where every email link and the Google round trip land. Public, because the
      // learner is by definition not signed in to this app yet when they arrive.
      { path: '/auth/callback', element: suspense(<AuthCallback />) },
      {
        path: '/onboarding',
        element: <RequireAuth>{suspense(<OnboardingStart />)}</RequireAuth>,
      },
      {
        // GATED (DIAGNOSTIC_ENABLED): the placement diagnostic runner is served
        // only by the dev/preview Vite plugin — there is no deployed
        // `/v1/diagnostic/*` backend — so in prod this route redirects to plan
        // setup instead of loading a runner that dead-ends. RequireAuth still
        // wraps it, so a signed-out visitor is sent to sign-in first either way.
        // See ./capabilities.ts (DIAGNOSTIC_ENABLED).
        path: '/onboarding/diagnostic',
        element: (
          <RequireAuth>
            {DIAGNOSTIC_ENABLED ? (
              suspense(<Diagnostic />)
            ) : (
              <Navigate to="/onboarding/plan" replace />
            )}
          </RequireAuth>
        ),
      },
      {
        path: '/onboarding/plan',
        element: <RequireAuth>{suspense(<PlanSetup />)}</RequireAuth>,
      },
      // Generator review surface. Outside AppShell on purpose: it sits on fixtures and mints
      // no evidence, so it must not appear as a learner tab or touch the authority kernel.
      { path: '/cars-preview', element: suspense(<CarsPreview />) },
      {
        path: '/app',
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: suspense(<Home />) },
          { path: 'curriculum', element: <Curriculum /> },
          { path: 'lessons/vectors-and-trigonometry', element: <VectorLesson /> },
          // The normalized-engine catalog (L2/L3) plays through the shared CatalogLesson
          // player on real routes matching L1's shape. WHICH lesson runs is fixed by the
          // slug; the registration manifest is the source of truth for these paths.
          { path: 'lessons/v3-les-789208', element: <CatalogLesson lessonId="V3-LES-789208" /> },
          { path: 'lessons/v3-les-844372', element: <CatalogLesson lessonId="V3-LES-844372" /> },
          // Today's Path — the daily learning-plan engine (guided one-at-a-time runner).
          { path: 'today', element: suspense(<TodaysPath />) },
          // The standalone `/app/learn` Study loop was retired: it duplicated adaptive
          // Practice and was only reachable from orphaned entry points. Study.tsx is kept
          // (its no-cause-picker contract is still asserted) but no longer routed.
          // Recall (Anki-style flashcards): the tab landing plus its child surfaces.
          { path: 'recall', element: suspense(<RecallHome />) },
          { path: 'recall/review', element: suspense(<RecallReview />) },
          { path: 'recall/browse', element: suspense(<CardBrowser />) },
          { path: 'recall/new', element: suspense(<CardEditor />) },
          { path: 'recall/edit/:cardId', element: suspense(<CardEditor />) },
          { path: 'recall/import', element: suspense(<ImportApkg />) },
          { path: 'mistakes', element: suspense(<Mistakes />) },
          // The guided Review-Mistakes repair runner (one mistake at a time + a fresh one).
          { path: 'mistakes/repair', element: suspense(<MistakesRepair />) },
          { path: 'progress', element: suspense(<Progress />) },
          // The standalone Skills page is merged into Progress (Concept B): its seven
          // reasoning-skill readouts now render as the Progress dashboard's left rail.
          // The nav item still points at /app/skills (kept for the app-shell contract),
          // so this redirect lands it on the merged dashboard. The per-cluster detail
          // (linked from the brain) keeps its own route below.
          { path: 'skills', element: <Navigate to="/app/progress" replace /> },
          { path: 'skills/:skillId', element: suspense(<SkillDetail />) },
          // Hooks now surface contextually rather than living under a Practice tab.
          { path: 'passage', element: suspense(<PassageOfDay />) },
          { path: 'cars', element: suspense(<CarsDuel />) },
          { path: 'wrapped', element: suspense(<Wrapped />) },
          // Adaptive Practice: the hub plus its in-place session.
          { path: 'practice', element: suspense(<PracticeHome />) },
          { path: 'practice/session', element: suspense(<PracticeSession />) },
          // The periodic, scored practice TEST (fixed-form, block-by-block runner).
          // GATED: the runner is dev/preview-only (no deployed backend), so in prod
          // this route redirects to the Practice hub instead of loading a dead runner.
          // See ./capabilities.ts (PRACTICE_TEST_ENABLED).
          {
            path: 'practice/test',
            element: PRACTICE_TEST_ENABLED ? (
              suspense(<PracticeTest />)
            ) : (
              <Navigate to="/app/practice" replace />
            ),
          },
          { path: 'profile', element: suspense(<Profile />) },
        ],
      },
      // Catch-all 404: any URL that matches nothing above lands on a calm, styled
      // page with a link home rather than a blank screen.
      { path: '*', element: <NotFound /> },
    ],
  },
]);
