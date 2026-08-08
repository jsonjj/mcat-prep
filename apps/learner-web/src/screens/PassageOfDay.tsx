import { useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Callout, Card, Eyebrow, Inline, Stack } from '@mcat/ui-web';
import { useBootstrap } from '../app/queries';
import { fetchTodaysPassage, gradePassage } from './passage/passage-client';
import { isPassageDone, markPassageDone } from './passage/passage-status';
import type {
  PassageChoiceId,
  PassageGrade,
  PassageQuestionView,
  PassageTodayView,
} from './passage/passage-client';

/**
 * Passage of the Day — a formative CARS-style reading rep.
 *
 * The passage rotates daily from a vetted pool (server-selected by the learner's
 * local day) and is scored server-side with an explanation reveal. It is
 * display + score ONLY: it writes no mastery, logs no mistake, and never routes
 * through the authority kernel — a low-stakes rep to keep reading stamina warm.
 *
 * Like a diagnostic/practice block, the passage stays on screen while its
 * questions are worked ONE AT A TIME, with Back/Next moving between them. Each
 * question keeps its own answer and its revealed explanation, so navigating away
 * and back shows the earlier result rather than resetting it.
 */

function revealClass(
  choiceId: PassageChoiceId,
  picked: PassageChoiceId | null,
  grade: PassageGrade | null,
): string {
  if (grade === null) return picked === choiceId ? 'mc-choice--selected' : '';
  if (choiceId === grade.correctChoiceId) return 'mc-choice--correct';
  if (choiceId === picked) return 'mc-choice--incorrect';
  return '';
}

/**
 * One question, driven entirely by props: the runner owns the answer and grade
 * so they survive Back/Next. Presentational only — it selects and checks through
 * callbacks and never fetches.
 */
function PassageQuestionCard({
  question,
  index,
  total,
  picked,
  grade,
  isChecking,
  checkFailed,
  headingRef,
  onSelect,
  onCheck,
}: {
  question: PassageQuestionView;
  index: number;
  total: number;
  picked: PassageChoiceId | null;
  grade: PassageGrade | null;
  isChecking: boolean;
  checkFailed: boolean;
  headingRef: RefObject<HTMLHeadingElement>;
  onSelect: (choiceId: PassageChoiceId) => void;
  onCheck: () => void;
}) {
  const locked = grade !== null;

  return (
    <Card elevated as="section" className="mc-potd__q">
      <Stack gap={3}>
        <p className="mc-potd__qcount" aria-live="polite">
          Question {index + 1} of {total}
        </p>
        <h2 className="mc-h3" tabIndex={-1} ref={headingRef}>
          {question.stem}
        </h2>

        <fieldset className="mc-choices" disabled={locked || isChecking}>
          <legend className="mc-visually-hidden">Answer choices</legend>
          {question.choices.map((c) => (
            <label key={c.id} className={`mc-choice ${revealClass(c.id, picked, grade)}`}>
              <input
                type="radio"
                name={`answer-${question.id}`}
                value={c.id}
                checked={picked === c.id}
                onChange={() => onSelect(c.id)}
              />
              <span className="mc-choice__key">{c.id}</span>
              <span className="mc-choice__text">{c.text}</span>
            </label>
          ))}
        </fieldset>

        {grade ? (
          <Stack gap={2}>
            <div className="mc-inline">
              <span
                className={`mc-reveal__key ${grade.correct ? 'mc-reveal__key--ok' : 'mc-reveal__key--wrong'}`}
              >
                {grade.correct ? 'Correct' : 'Answer'}: {grade.correctChoiceId}
              </span>
            </div>
            <p>{grade.rationale}</p>
            {!grade.correct && grade.choiceRationale ? (
              <Callout tone="info" title={`Why ${picked} misses`}>
                {grade.choiceRationale}
              </Callout>
            ) : null}
          </Stack>
        ) : (
          <Button
            variant="primary"
            size="lg"
            disabled={picked === null || isChecking}
            loading={isChecking}
            onClick={onCheck}
          >
            Check my answer
          </Button>
        )}

        {checkFailed ? (
          <Callout tone="warning" title="Couldn’t score that">
            Something went wrong scoring your answer. Please try again.
          </Callout>
        ) : null}
      </Stack>
    </Card>
  );
}

/**
 * The runner for a loaded passage. Holds the per-question answer and grade maps
 * and the current index, so the whole passage's questions are navigable while
 * only one shows at a time. Keyed by passage id upstream, so a new day's passage
 * mounts fresh rather than inheriting yesterday's answers.
 */
function PassageRunner({
  passage,
  learnerId,
}: {
  passage: PassageTodayView;
  learnerId: string | null;
}) {
  const navigate = useNavigate();
  const total = passage.questions.length;

  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, PassageChoiceId>>({});
  const [grades, setGrades] = useState<Record<string, PassageGrade>>({});

  // Once every question has been checked, the day's rep is done: remember it so
  // the passage closes until tomorrow rather than being repeatable. The learner
  // still sees the full result in this session; the gate only applies on return.
  const answered = Object.keys(grades).length;
  useEffect(() => {
    if (total > 0 && answered >= total) markPassageDone(learnerId, passage.localDate);
  }, [answered, total, learnerId, passage.localDate]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to the new stem on Back/Next (so keyboard and screen-reader users
  // land on the question they navigated to), but not on first render — the
  // learner should meet the passage first, not be yanked down to question one.
  const hasNavigatedRef = useRef(false);

  const check = useMutation({
    mutationFn: (vars: { questionId: string; choiceId: PassageChoiceId }) =>
      gradePassage(vars.questionId, vars.choiceId),
    onSuccess: (grade, vars) => {
      setGrades((prev) => ({ ...prev, [vars.questionId]: grade }));
    },
  });

  useEffect(() => {
    if (!hasNavigatedRef.current) return;
    headingRef.current?.focus();
  }, [index]);

  const question = passage.questions[index];
  // A served passage always has at least one question, but guard so a bad index
  // can never throw in the runner.
  if (!question) return null;

  const picked = choices[question.id] ?? null;
  const grade = grades[question.id] ?? null;
  // Pending/failed state is scoped to the question it belongs to, so a failure on
  // one question never bleeds a warning onto another as you navigate.
  const isCheckingThis = check.isPending && check.variables?.questionId === question.id;
  const checkFailedThis = check.isError && check.variables?.questionId === question.id;

  const goTo = (next: number) => {
    if (next < 0 || next >= total) return;
    hasNavigatedRef.current = true;
    setIndex(next);
  };

  return (
    <div className="mc-screen mc-study mc-potd">
      <header className="mc-potd__head">
        <Eyebrow>Passage of the day · {passage.discipline}</Eyebrow>
        <h1 className="mc-h1">{passage.title}</h1>
        <p className="mc-muted mc-fineprint">
          A short CARS-style reading rep — everything you need is in the passage. It’s formative
          only: read closely, reason it through, and check your thinking. It never counts toward
          mastery.
        </p>
      </header>

      <Card elevated className="mc-stimulus mc-potd__passage">
        <p className="mc-potd__passagelabel">Passage</p>
        <Stack gap={2}>
          {passage.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </Stack>
      </Card>

      <PassageQuestionCard
        question={question}
        index={index}
        total={total}
        picked={picked}
        grade={grade}
        isChecking={isCheckingThis}
        checkFailed={checkFailedThis}
        headingRef={headingRef}
        onSelect={(choiceId) => setChoices((prev) => ({ ...prev, [question.id]: choiceId }))}
        onCheck={() => {
          if (picked !== null) check.mutate({ questionId: question.id, choiceId: picked });
        }}
      />

      <Inline className="mc-potd__nav" style={{ justifyContent: 'space-between' }}>
        <Button variant="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>
          Back
        </Button>
        <Button variant="secondary" disabled={index >= total - 1} onClick={() => goTo(index + 1)}>
          Next
        </Button>
      </Inline>

      <div className="mc-potd__foot">
        <Button variant="secondary" onClick={() => navigate('/app')}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}

export function PassageOfDay() {
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const learnerId = bootstrap.data?.authenticated === true ? bootstrap.data.learnerId : null;
  const today = useQuery({ queryKey: ['passage-today'], queryFn: fetchTodaysPassage });

  if (today.isLoading) {
    return <div className="mc-center mc-muted">Loading today’s passage…</div>;
  }

  if (today.isError) {
    return (
      <div className="mc-screen mc-study mc-potd">
        <header className="mc-potd__head">
          <Eyebrow>Passage of the day</Eyebrow>
          <h1 className="mc-h1">Read, reason, decide</h1>
        </header>
        <Callout tone="warning" title="Passage unavailable">
          Today’s passage couldn’t be loaded. Check your connection and try again.
        </Callout>
        <div className="mc-potd__foot">
          <Button variant="primary" onClick={() => void today.refetch()}>
            Try again
          </Button>
          <Button variant="text" onClick={() => navigate('/app')}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  const passage = today.data;
  if (!passage) {
    return (
      <div className="mc-screen mc-study mc-potd">
        <header className="mc-potd__head">
          <Eyebrow>Passage of the day</Eyebrow>
          <h1 className="mc-h1">Read, reason, decide</h1>
        </header>
        <Callout tone="info" title="No passage today">
          The passage library is quiet right now. Check back soon — the daily reading rep rotates
          through a growing pool.
        </Callout>
        <div className="mc-potd__foot">
          <Button variant="secondary" onClick={() => navigate('/app')}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // Once-a-day rep: if this learner already finished today's passage, it's closed
  // until tomorrow's rotates in — show a calm "done" state instead of re-serving it.
  if (isPassageDone(learnerId, passage.localDate)) {
    return (
      <div className="mc-screen mc-study mc-potd">
        <header className="mc-potd__head">
          <Eyebrow>Passage of the day</Eyebrow>
          <h1 className="mc-h1">You’re done for today.</h1>
          <p className="mc-muted mc-fineprint">
            You’ve finished today’s reading rep — “{passage.title}.” It’s formative only, so there’s
            nothing to redo. A fresh passage rotates in tomorrow.
          </p>
        </header>
        <Callout tone="info" title="Come back tomorrow">
          The Passage of the Day is once a day. Your next one will be here after the daily reset.
        </Callout>
        <div className="mc-potd__foot">
          <Button variant="primary" onClick={() => navigate('/app')}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // Keyed by passage id so the runner's per-question state resets cleanly when
  // the day (and passage) changes.
  return <PassageRunner key={passage.id} passage={passage} learnerId={learnerId} />;
}
