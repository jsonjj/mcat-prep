import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';

/**
 * The four MCAT sections a half-length checkpoint samples from. Static learner
 * copy — this screen *describes* the test; it never builds or scores one.
 */
const SECTIONS = [
  'Chemical & Physical Foundations',
  'Critical Analysis & Reasoning',
  'Biological & Biochemical Foundations',
  'Psychological, Social & Biological Foundations',
] as const;

/**
 * Tests — the "start your checkpoint" landing.
 *
 * Presentational ONLY: it introduces the half-length practice test and offers a
 * disabled Start while the test engine itself is still in design. It makes no
 * API calls, fetches no data, and runs no client engine — so it is safe to reach
 * from the sidebar and from the Today's-Path "Practice Test" card without ever
 * starting (or faking) a scored sitting. The runner, scoring, and history are
 * deferred until the design is settled.
 */
export function Tests() {
  const soonId = 'mc-test-soon';
  const coversId = 'mc-test-covers';
  return (
    <div className="mc-screen mc-test">
      <header className="mc-screen__head">
        <Eyebrow>Checkpoint</Eyebrow>
        <h1 className="mc-h1">Practice Test</h1>
        <p className="mc-muted">Half-length · about 90 min · scored</p>
      </header>

      <Card elevated>
        <Stack gap={5}>
          <div className="mc-test__covers">
            <p className="mc-eyebrow" id={coversId}>
              Covers
            </p>
            <ul className="mc-test__sections" aria-labelledby={coversId}>
              {SECTIONS.map((section) => (
                <li key={section} className="mc-test__section">
                  {section}
                </li>
              ))}
            </ul>
          </div>

          <div className="mc-test__start">
            <Button
              variant="primary"
              size="lg"
              disabled
              aria-label="Start test"
              aria-describedby={soonId}
            >
              Start test
            </Button>
            <p className="mc-muted mc-fineprint mc-test__soon" id={soonId}>
              Coming soon — the test itself is still in design.
            </p>
          </div>
        </Stack>
      </Card>

      <p className="mc-muted mc-fineprint">Test history — coming soon</p>
    </div>
  );
}
