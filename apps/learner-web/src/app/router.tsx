import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../screens/AppShell';
import { Welcome } from '../screens/Welcome';
import { Diagnostic } from '../screens/Diagnostic';
import { PlanSetup } from '../screens/PlanSetup';
import { Home } from '../screens/Home';
import { Study } from '../screens/Study';
import { Recall } from '../screens/Recall';
import { Mistakes } from '../screens/Mistakes';
import { Progress } from '../screens/Progress';
import { Skills } from '../screens/Skills';
import { SkillDetail } from '../screens/SkillDetail';
import { Profile } from '../screens/Profile';
import { PassageOfDay } from '../screens/PassageOfDay';
import { CarsDuel } from '../screens/CarsDuel';
import { Wrapped } from '../screens/Wrapped';

export const router = createBrowserRouter([
  { path: '/', element: <Welcome /> },
  { path: '/onboarding/diagnostic', element: <Diagnostic /> },
  { path: '/onboarding/plan', element: <PlanSetup /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      // Today merged into Home; keep the path working for bookmarks.
      { path: 'today', element: <Navigate to="/app" replace /> },
      { path: 'learn', element: <Study /> },
      { path: 'recall', element: <Recall /> },
      { path: 'mistakes', element: <Mistakes /> },
      { path: 'progress', element: <Progress /> },
      { path: 'skills', element: <Skills /> },
      { path: 'skills/:skillId', element: <SkillDetail /> },
      // Hooks now surface contextually rather than living under a Practice tab.
      { path: 'passage', element: <PassageOfDay /> },
      { path: 'cars', element: <CarsDuel /> },
      { path: 'wrapped', element: <Wrapped /> },
      // Practice tab + Focus mode removed; redirect old paths for bookmarks.
      { path: 'practice', element: <Navigate to="/app" replace /> },
      { path: 'practice/*', element: <Navigate to="/app" replace /> },
      { path: 'profile', element: <Profile /> },
    ],
  },
]);
