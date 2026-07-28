import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { getAppNativeLesson } from '../app-native';
import { LessonRenderer } from '../app-native/LessonRenderer';
import { useRecordMistake } from '../app/today-queries';

/**
 * App-native lesson host. Resolves the `:slug` route param to one of the
 * data-driven pilot lessons and hands it to the shared `LessonRenderer`. When
 * launched from Today's Path (returnTo in nav state), completion returns to the
 * plan and marks the activity done; otherwise "back to lessons" points at the map.
 */
export function Lesson() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug = null } = useParams();
  const lesson = getAppNativeLesson(slug);
  const navState = location.state as { returnTo?: string; activityId?: string } | null;
  const returnTo = navState?.returnTo;
  const activityId = navState?.activityId;
  const recordMistake = useRecordMistake();

  if (!lesson) {
    return (
      <div className="mc-screen">
        <Card elevated>
          <Stack gap={3}>
            <Eyebrow>Lesson</Eyebrow>
            <h1 className="mc-h2">This lesson isn’t available yet.</h1>
            <p className="mc-muted">
              Only a few pilot lessons are playable right now. Browse the full path to see what’s
              coming.
            </p>
            <Button variant="primary" size="lg" onClick={() => navigate('/app/curriculum')}>
              Back to curriculum
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  return (
    <LessonRenderer
      key={`${lesson.script.id}:${lesson.script.contentVersion}`}
      script={lesson.script}
      presentation={lesson.presentation}
      lessonIndexHref={returnTo ?? '/app/curriculum'}
      onIndependentMiss={() => recordMistake.mutate('lesson')}
      {...(returnTo
        ? { onComplete: () => navigate(returnTo, { state: { completedActivityId: activityId } }) }
        : {})}
    />
  );
}
