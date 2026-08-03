import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { AppShell } from '../screens/AppShell';
import { Homepage } from '../screens/Homepage';
import { OnboardingStart } from '../screens/OnboardingStart';
import { SignIn } from '../screens/auth/SignIn';
import { SignUp } from '../screens/auth/SignUp';
import { AuthCallback } from '../screens/auth/AuthCallback';
import { CheckEmail } from '../screens/auth/CheckEmail';
import { ForgotPassword } from '../screens/auth/ForgotPassword';
import { Diagnostic } from '../screens/Diagnostic';
import { PlanSetup } from '../screens/PlanSetup';
import { Home } from '../screens/Home';
import { TodaysPath } from '../screens/today/TodaysPath';
import { Curriculum } from '../screens/Curriculum';
import { VectorLesson } from '../screens/VectorLesson';
import { CatalogLesson } from '../screens/CatalogLesson';
import { RecallHome } from '../screens/recall/RecallHome';
import { RecallReview } from '../screens/recall/RecallReview';
import { CardBrowser } from '../screens/recall/CardBrowser';
import { CardEditor } from '../screens/recall/CardEditor';
import { ImportApkg } from '../screens/recall/ImportApkg';
import { Mistakes } from '../screens/Mistakes';
import { MistakesRepair } from '../screens/mistakes/MistakesRepair';
import { Progress } from '../screens/Progress';
import { SkillDetail } from '../screens/SkillDetail';
import { Profile } from '../screens/Profile';
import { PassageOfDay } from '../screens/PassageOfDay';
import { PracticeHome } from '../screens/practice/PracticeHome';
import { PracticeSession } from '../screens/practice/PracticeSession';
import { PracticeTest } from '../screens/practice/PracticeTest';
import { CarsDuel } from '../screens/CarsDuel';
import { Wrapped } from '../screens/Wrapped';
import { CarsPreview } from '../screens/CarsPreview';
import { PRACTICE_TEST_ENABLED } from './capabilities';

export const router = createBrowserRouter([
  // Public: the marketing homepage and the four credential screens. Everything
  // else sits behind RequireAuth, because every other surface reads or writes
  // learner evidence and the authority now refuses those without a linked session.
  { path: '/', element: <Homepage /> },
  { path: '/signin', element: <SignIn /> },
  { path: '/signup', element: <SignUp /> },
  { path: '/check-email', element: <CheckEmail /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  // Where every email link and the Google round trip land. Public, because the
  // learner is by definition not signed in to this app yet when they arrive.
  { path: '/auth/callback', element: <AuthCallback /> },
  {
    path: '/onboarding',
    element: (
      <RequireAuth>
        <OnboardingStart />
      </RequireAuth>
    ),
  },
  {
    path: '/onboarding/diagnostic',
    element: (
      <RequireAuth>
        <Diagnostic />
      </RequireAuth>
    ),
  },
  {
    path: '/onboarding/plan',
    element: (
      <RequireAuth>
        <PlanSetup />
      </RequireAuth>
    ),
  },
  // Generator review surface. Outside AppShell on purpose: it sits on fixtures and mints
  // no evidence, so it must not appear as a learner tab or touch the authority kernel.
  { path: '/cars-preview', element: <CarsPreview /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'curriculum', element: <Curriculum /> },
      { path: 'lessons/vectors-and-trigonometry', element: <VectorLesson /> },
      // The normalized-engine catalog (L2/L3) plays through the shared CatalogLesson
      // player on real routes matching L1's shape. WHICH lesson runs is fixed by the
      // slug; the registration manifest is the source of truth for these paths.
      { path: 'lessons/v3-les-789208', element: <CatalogLesson lessonId="V3-LES-789208" /> },
      { path: 'lessons/v3-les-844372', element: <CatalogLesson lessonId="V3-LES-844372" /> },
      // Today's Path — the daily learning-plan engine (guided one-at-a-time runner).
      { path: 'today', element: <TodaysPath /> },
      // The standalone `/app/learn` Study loop was retired: it duplicated adaptive
      // Practice and was only reachable from orphaned entry points. Study.tsx is kept
      // (its no-cause-picker contract is still asserted) but no longer routed.
      // Recall (Anki-style flashcards): the tab landing plus its child surfaces.
      { path: 'recall', element: <RecallHome /> },
      { path: 'recall/review', element: <RecallReview /> },
      { path: 'recall/browse', element: <CardBrowser /> },
      { path: 'recall/new', element: <CardEditor /> },
      { path: 'recall/edit/:cardId', element: <CardEditor /> },
      { path: 'recall/import', element: <ImportApkg /> },
      { path: 'mistakes', element: <Mistakes /> },
      // The guided Review-Mistakes repair runner (one mistake at a time + a fresh one).
      { path: 'mistakes/repair', element: <MistakesRepair /> },
      { path: 'progress', element: <Progress /> },
      // The standalone Skills page is merged into Progress (Concept B): its seven
      // reasoning-skill readouts now render as the Progress dashboard's left rail.
      // The nav item still points at /app/skills (kept for the app-shell contract),
      // so this redirect lands it on the merged dashboard. The per-cluster detail
      // (linked from the brain) keeps its own route below.
      { path: 'skills', element: <Navigate to="/app/progress" replace /> },
      { path: 'skills/:skillId', element: <SkillDetail /> },
      // Hooks now surface contextually rather than living under a Practice tab.
      { path: 'passage', element: <PassageOfDay /> },
      { path: 'cars', element: <CarsDuel /> },
      { path: 'wrapped', element: <Wrapped /> },
      // Adaptive Practice: the hub plus its in-place session.
      { path: 'practice', element: <PracticeHome /> },
      { path: 'practice/session', element: <PracticeSession /> },
      // The periodic, scored practice TEST (fixed-form, block-by-block runner).
      // GATED: the runner is dev/preview-only (no deployed backend), so in prod
      // this route redirects to the Practice hub instead of loading a dead runner.
      // See ./capabilities.ts (PRACTICE_TEST_ENABLED).
      {
        path: 'practice/test',
        element: PRACTICE_TEST_ENABLED ? <PracticeTest /> : <Navigate to="/app/practice" replace />,
      },
      { path: 'profile', element: <Profile /> },
    ],
  },
]);
