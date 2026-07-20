import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useToday } from '../app/queries';

const REASON_TEXT: Record<string, string> = {
  UNFINISHED_CHECKPOINT: 'Resume where you left off',
  NEW_LEARNING: 'New learning',
  OVERDUE_REVIEW: 'Due review',
  PREREQUISITE_BLOCKER: 'Prerequisite first',
};

export function Today() {
  const navigate = useNavigate();
  const today = useToday();

  if (today.isLoading || !today.data) return <div className="mc-center mc-muted">Loading today…</div>;

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Today</h1>
        <p className="mc-muted">
          About {Math.round(today.data.reviewSharePct * 100)}% of study time is reserved for review.
        </p>
      </header>

      <Stack gap={3}>
        {today.data.tasks.map((task) => (
          <Card key={task.taskId} elevated>
            <div className="mc-task">
              <div>
                <Eyebrow>{REASON_TEXT[task.priorityReason] ?? 'Recommended'}</Eyebrow>
                <p className="mc-task__title">{task.title}</p>
                <p className="mc-muted mc-fineprint">
                  {task.estimatedMinutes} min · {task.reasonDetail ?? ''}
                </p>
              </div>
              <Button
                variant={task.status === 'in_progress' ? 'primary' : 'secondary'}
                onClick={() => navigate(task.type === 'quick_practice' ? '/app/recall' : '/app/learn')}
              >
                {task.status === 'in_progress' ? 'Continue' : 'Start'}
              </Button>
            </div>
          </Card>
        ))}
      </Stack>

      <Callout tone="info">
        Miss a day? Nothing piles up as shame — the plan recalculates from what you actually
        complete.
      </Callout>
    </div>
  );
}
