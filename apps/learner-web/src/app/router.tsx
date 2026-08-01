import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../screens/AppShell';
import { Welcome } from '../screens/Welcome';
import { Diagnostic } from '../screens/Diagnostic';
import { PlanSetup } from '../screens/PlanSetup';
import { Home } from '../screens/Home';
import { TodaysPath } from '../screens/today/TodaysPath';
import { Curriculum } from '../screens/Curriculum';
import { VectorLesson } from '../screens/VectorLesson';
import { CatalogLesson } from '../screens/CatalogLesson';
import { Study } from '../screens/Study';
import { RecallHome } from '../screens/recall/RecallHome';
import { RecallReview } from '../screens/recall/RecallReview';
import { CardBrowser } from '../screens/recall/CardBrowser';
import { CardEditor } from '../screens/recall/CardEditor';
import { ImportApkg } from '../screens/recall/ImportApkg';
import { Mistakes } from '../screens/Mistakes';
import { MistakesRepair } from '../screens/mistakes/MistakesRepair';
import { Progress } from '../screens/Progress';
import { SkillDetail } from '../screens/SkillDetail';
// Account/Profile screen is TEMPORARILY HIDDEN for now — import kept commented so the
// route below is trivially restorable. Profile.tsx and the backend goal wiring stay intact.
// import { Profile } from '../screens/Profile';
import { PassageOfDay } from '../screens/PassageOfDay';
import { PracticeHome } from '../screens/practice/PracticeHome';
import { PracticeSession } from '../screens/practice/PracticeSession';
import { PracticeTest } from '../screens/practice/PracticeTest';
import { CarsDuel } from '../screens/CarsDuel';
import { Wrapped } from '../screens/Wrapped';
import { CarsPreview } from '../screens/CarsPreview';

export const router = createBrowserRouter([
  { path: '/', element: <Welcome /> },
  { path: '/onboarding/diagnostic', element: <Diagnostic /> },
  { path: '/onboarding/plan', element: <PlanSetup /> },
  // Generator review surface. Outside AppShell on purpose: it sits on fixtures and mints
  // no evidence, so it must not appear as a learner tab or touch the authority kernel.
  { path: '/cars-preview', element: <CarsPreview /> },
  {
    path: '/app',
    element: <AppShell />,
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
      { path: 'learn', element: <Study /> },
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
      { path: 'practice/test', element: <PracticeTest /> },
      // Account/Profile route TEMPORARILY DISABLED (see the commented import above).
      // Re-enable this line and the import to restore /app/profile.
      // { path: 'profile', element: <Profile /> },
    ],
  },
]);
