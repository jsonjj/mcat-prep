import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useConfirmPlan } from '../app/queries';

export function PlanSetup() {
  const navigate = useNavigate();
  const confirm = useConfirmPlan();
  const [scheduled, setScheduled] = useState(false);
  const [testDate, setTestDate] = useState('');
  const [target, setTarget] = useState('511');
  const [hours, setHours] = useState('7');

  const parsedHours = Number(hours);
  const minutesPerWeek =
    Number.isFinite(parsedHours) && parsedHours > 0 ? Math.round(parsedHours * 60) : 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (minutesPerWeek <= 0) return;
    confirm.mutate(
      {
        testDate: scheduled && testDate ? new Date(testDate).toISOString() : null,
        targetScore: Number(target) || null,
        minutesPerWeek,
      },
      { onSuccess: () => navigate('/app', { replace: true }) },
    );
  };

  return (
    <div className="mc-onboarding">
      <Card elevated>
        <form onSubmit={onSubmit}>
          <Stack gap={5}>
            <Eyebrow>Plan setup</Eyebrow>
            <h1 className="mc-h2">Let&apos;s shape a plan around your time.</h1>

            <Stack gap={2}>
              <span className="mc-label">Test date</span>
              <label className="mc-switch">
                <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
                <span>I have a scheduled test date</span>
              </label>
              {scheduled ? (
                <input
                  className="mc-input"
                  type="date"
                  aria-label="Test date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                />
              ) : (
                <p className="mc-muted mc-fineprint">
                  No date yet is fine — you&apos;ll get a rolling plan and can add one later.
                </p>
              )}
            </Stack>

            <Stack gap={2}>
              <label className="mc-label" htmlFor="target">
                Target score
              </label>
              <input
                id="target"
                className="mc-input"
                type="number"
                min={472}
                max={528}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <p className="mc-fineprint mc-muted">
                Target changes pacing and optional depth — never correctness or what counts as
                mastery.
              </p>
            </Stack>

            <Stack gap={2}>
              <label className="mc-label" htmlFor="weekly-hours">
                Weekly study time
              </label>
              <div className="mc-input-suffix">
                <input
                  id="weekly-hours"
                  className="mc-input"
                  type="number"
                  min={1}
                  max={80}
                  step={0.5}
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  aria-describedby="weekly-hours-hint"
                />
                <span className="mc-input-suffix__unit">hours / week</span>
              </div>
              <p id="weekly-hours-hint" className="mc-fineprint mc-muted">
                A rough weekly budget — we use it to pace your plan, not to cap what you can study.
              </p>
            </Stack>

            <Callout tone="info" title="This is a planning estimate">
              We compare your time with the work remaining and show trade-offs — we never quietly
              drop required coverage or promise a score.
            </Callout>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              type="submit"
              disabled={confirm.isPending || minutesPerWeek <= 0}
            >
              {confirm.isPending ? 'Building your plan…' : 'Generate my plan'}
            </Button>
          </Stack>
        </form>
      </Card>
    </div>
  );
}
