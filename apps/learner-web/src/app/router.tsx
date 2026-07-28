import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../screens/AppShell';
import { Welcome } from '../screens/Welcome';
import { Diagnostic } from '../screens/Diagnostic';
import { PlanSetup } from '../screens/PlanSetup';
import { Home } from '../screens/Home';
import { TodaysPath } from '../screens/today/TodaysPath';
import { Curriculum } from '../screens/Curriculum';
import { VectorLesson } from '../screens/VectorLesson';
import { Lesson } from '../screens/Lesson';
import { Study } from '../screens/Study';
import { RecallHome } from '../screens/recall/RecallHome';
import { RecallReview } from '../screens/recall/RecallReview';
import { CardBrowser } from '../screens/recall/CardBrowser';
import { CardEditor } from '../screens/recall/CardEditor';
import { ImportApkg } from '../screens/recall/ImportApkg';
import { Mistakes } from '../screens/Mistakes';
import { Progress } from '../screens/Progress';
import { SkillDetail } from '../screens/SkillDetail';
import { Profile } from '../screens/Profile';
import { PassageOfDay } from '../screens/PassageOfDay';
import { PracticeHome } from '../screens/practice/PracticeHome';
import { PracticeSession } from '../screens/practice/PracticeSession';
import { CarsDuel } from '../screens/CarsDuel';
import { Wrapped } from '../screens/Wrapped';

export const router = createBrowserRouter([
  { path: '/', element: <Welcome /> },
  { path: '/onboarding/diagnostic', element: <Diagnostic /> },
  { path: '/onboarding/plan', element: <PlanSetup /> },
  // App-native lessons are a full-page, immersive experience: they render their
  // own shell/header, so they live *outside* AppShell to avoid a duplicate
  // top bar. Curriculum still links to `/app/lesson/:slug`.
  { path: '/app/lesson/:slug', element: <Lesson /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'curriculum', element: <Curriculum /> },
      { path: 'lessons/vectors-and-trigonometry', element: <VectorLesson /> },
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
      { path: 'profile', element: <Profile /> },
    ],
  },
]);
