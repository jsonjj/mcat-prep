import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { getAppNativeLesson } from '../app-native';
import { LessonRenderer } from '../app-native/LessonRenderer';

/**
 * App-native lesson host. Resolves the `:slug` route param to one of the
 * data-driven pilot lessons and hands it to the shared `LessonRenderer`. The
 * "back to lessons" affordance points at the curriculum map.
 */
export function Lesson() {
  const navigate = useNavigate();
  const { slug = null } = useParams();
  const lesson = getAppNativeLesson(slug);

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
      lessonIndexHref="/app/curriculum"
    />
  );
}
