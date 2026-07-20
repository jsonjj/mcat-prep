import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../screens/AppShell';
import { Welcome } from '../screens/Welcome';
import { Diagnostic } from '../screens/Diagnostic';
import { PlanSetup } from '../screens/PlanSetup';
import { Home } from '../screens/Home';
import { Today } from '../screens/Today';
import { Study } from '../screens/Study';
import { Recall } from '../screens/Recall';
import { Mistakes } from '../screens/Mistakes';
import { Progress } from '../screens/Progress';
import { Skills } from '../screens/Skills';
import { SkillDetail } from '../screens/SkillDetail';
import { Profile } from '../screens/Profile';

export const router = createBrowserRouter([
  { path: '/', element: <Welcome /> },
  { path: '/onboarding/diagnostic', element: <Diagnostic /> },
  { path: '/onboarding/plan', element: <PlanSetup /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'today', element: <Today /> },
      { path: 'learn', element: <Study /> },
      { path: 'recall', element: <Recall /> },
      { path: 'mistakes', element: <Mistakes /> },
      { path: 'progress', element: <Progress /> },
      { path: 'skills', element: <Skills /> },
      { path: 'skills/:skillId', element: <SkillDetail /> },
      { path: 'profile', element: <Profile /> },
    ],
  },
]);
