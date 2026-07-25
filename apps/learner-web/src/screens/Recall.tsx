import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { ChoiceId } from '../app/diagnostic-client';
import {
  fetchRecallQuestion,
  submitRecallAnswer,
  type RecallGrade,
  type RecallQuestion,
} from '../app/recall-client';
import { ensureSeeded, listTopics, rateTopic, type RecallTopic } from '../app/recall-schedule';

/**
 * Recall — spaced review that actually quizzes you.
 *
 * Topics (skill clusters) are scheduled by FSRS and seeded from the diagnostic.
 * When a topic is due, recall serves a real question from the bank, grades it
 * server-side, and reschedules the topic from the *result*: a correct answer
 * pushes the next review out, a miss brings it back soon. Grading moves the
 * schedule only — it never claims mastery.
 */

type Phase = 'loading' | 'question' | 'graded' | 'noquestion' | 'done';

export function Recall() {
  const [queue, setQueue] = useState<RecallTopic[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [question, setQuestion] = useState<RecallQuestion | null>(null);
  const [choice, setChoice] = useState<ChoiceId | null>(null);
  const [grade, setGrade] = useState<RecallGrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [finalTopics, setFinalTopics] = useState<RecallTopic[]>([]);
  const seenRef = useRef<string[]>([]);

  const loadQuestion = useCallback(async (topic: RecallTopic) => {
    setPhase('loading');
    setChoice(null);
    setGrade(null);
    setError(null);
    try {
      const q = await fetchRecallQuestion(topic.cluster, seenRef.current);
      if (q === null) {
        setQuestion(null);
        setPhase('noquestion');
      } else {
        setQuestion(q);
        setPhase('question');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load a question.');
      setPhase('noquestion');
    }
  }, []);

  useEffect(() => {
    // Safety net: seed a schedule if the learner skipped the diagnostic.
    ensureSeeded(null);
    const all = listTopics();
    const due = all.filter((t) => t.isDue);
    setQueue(due);
    if (due.length === 0) {
      setFinalTopics(all);
      setPhase('done');
    } else {
      void loadQuestion(due[0]!);
    }
  }, [loadQuestion]);

  const current = queue[idx] ?? null;

  const onCheck = () => {
    if (current === null || question === null || choice === null || busy) return;
    setBusy(true);
    submitRecallAnswer(question.id, choice)
      .then((result) => {
        setGrade(result);
        setPhase('graded');
        setAnswered((n) => n + 1);
        if (result.correct) setCorrect((n) => n + 1);
        if (question.id) seenRef.current = [...seenRef.current, question.id];
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not grade that answer.'))
      .finally(() => setBusy(false));
  };

  const advance = () => {
    if (current === null) return;
    // Correct → schedule further out; miss (or unquizzable) → bring back soon.
    const rating = phase === 'graded' && grade?.correct ? 'good' : phase === 'graded' ? 'again' : 'good';
    rateTopic(current.cluster, rating);
    const next = idx + 1;
    if (next >= queue.length) {
      setFinalTopics(listTopics());
      setPhase('done');
      return;
    }
    setIdx(next);
    void loadQuestion(queue[next]!);
  };

  if (phase === 'done') {
    return <RecallDone answered={answered} correct={correct} topics={finalTopics} />;
  }

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Recall</h1>
        <p className="mc-muted">
          A due topic, one question at a time. Answer from memory — a correct answer pushes the topic
          further out; a miss brings it back soon.
        </p>
      </header>

      {current !== null ? (
        <Stack gap={4}>
          <div className="mc-recall__progress">
            <Eyebrow>{`Topic ${idx + 1} of ${queue.length}`}</Eyebrow>
            <h2 className="mc-h3">{current.title}</h2>
            <p className="mc-muted mc-fineprint">
              {current.confirming ? 'Confirming your placement read. ' : ''}
              {current.tested}
            </p>
          </div>

          {phase === 'loading' ? (
            <Card elevated>
              <p className="mc-muted">Loading a question…</p>
            </Card>
          ) : phase === 'noquestion' ? (
            <Card elevated>
              <Stack gap={3}>
                <p>
                  {error ?? 'No recall questions are available for this topic yet.'}
                </p>
                {current.lessonSlug ? (
                  <Link to={`/app/lesson/${current.lessonSlug}`} className="mc-textbtn">
                    Study this topic →
                  </Link>
                ) : null}
                <Button variant="primary" size="lg" fullWidth onClick={advance}>
                  {idx + 1 >= queue.length ? 'Finish' : 'Next topic'}
                </Button>
              </Stack>
            </Card>
          ) : question !== null ? (
            <QuestionCard
              question={question}
              choice={choice}
              grade={grade}
              busy={busy}
              error={error}
              lessonSlug={current.lessonSlug}
              lastTopic={idx + 1 >= queue.length}
              onSelect={setChoice}
              onCheck={onCheck}
              onContinue={advance}
            />
          ) : null}
        </Stack>
      ) : null}

      <Callout tone="info" title="How this works">
        Recall quizzes you with real questions and grades them on the server. Your result reschedules
        the topic with FSRS — it never claims mastery.
      </Callout>
    </div>
  );
}

function QuestionCard({
  question,
  choice,
  grade,
  busy,
  error,
  lessonSlug,
  lastTopic,
  onSelect,
  onCheck,
  onContinue,
}: {
  question: RecallQuestion;
  choice: ChoiceId | null;
  grade: RecallGrade | null;
  busy: boolean;
  error: string | null;
  lessonSlug: string | null;
  lastTopic: boolean;
  onSelect: (choice: ChoiceId) => void;
  onCheck: () => void;
  onContinue: () => void;
}) {
  const graded = grade !== null;
  return (
    <Card elevated>
      <Stack gap={4}>
        {question.passage ? <p className="mc-recall__passage">{question.passage}</p> : null}
        <fieldset className="mc-choices mc-recall__question">
          <legend className="mc-recall__stem">{question.stem}</legend>
          {question.choices.map((option) => {
            const isCorrect = graded && option.id === grade.correctChoiceId;
            const isWrongPick = graded && option.id === choice && !grade.correct;
            const cls = [
              'mc-choice',
              choice === option.id ? 'mc-choice--selected' : '',
              isCorrect ? 'mc-choice--correct' : '',
              isWrongPick ? 'mc-choice--incorrect' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <label className={cls} key={option.id}>
                <input
                  type="radio"
                  name={`recall-${question.id}`}
                  value={option.id}
                  checked={choice === option.id}
                  disabled={graded || busy}
                  onChange={() => onSelect(option.id)}
                />
                <span className="mc-choice__key">{option.id}</span>
                <span className="mc-choice__text">{option.text}</span>
              </label>
            );
          })}
        </fieldset>

        {!graded ? (
          <>
            {error ? <p className="mc-error">{error}</p> : null}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={choice === null || busy}
              onClick={onCheck}
            >
              {busy ? 'Checking…' : 'Check answer'}
            </Button>
          </>
        ) : (
          <>
            <Callout tone={grade.correct ? 'success' : 'info'}>
              <Stack gap={2}>
                <strong>
                  {grade.correct
                    ? 'Correct.'
                    : `Not quite — the answer is ${grade.correctChoiceId}.`}
                </strong>
                {grade.explanation ? <p>{grade.explanation}</p> : null}
              </Stack>
            </Callout>
            {lessonSlug ? (
              <Link to={`/app/lesson/${lessonSlug}`} className="mc-textbtn">
                Study this topic →
              </Link>
            ) : null}
            <Button variant="primary" size="lg" fullWidth onClick={onContinue}>
              {lastTopic ? 'Finish' : 'Next topic'}
            </Button>
          </>
        )}
      </Stack>
    </Card>
  );
}

function RecallDone({
  answered,
  correct,
  topics,
}: {
  answered: number;
  correct: number;
  topics: RecallTopic[];
}) {
  const upcoming = topics.filter((t) => !t.isDue);
  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Recall</h1>
      </header>
      <Card elevated>
        <Stack gap={3}>
          <Eyebrow>All caught up</Eyebrow>
          {answered > 0 ? (
            <p>
              You answered <strong>{correct}</strong> of <strong>{answered}</strong> correctly. Each
              topic is rescheduled from how you did.
            </p>
          ) : (
            <p>No topics are due for recall right now.</p>
          )}
          <Link to="/app/curriculum" className="mc-button mc-button--primary mc-button--lg">
            <span className="mc-button__label">Browse the curriculum</span>
          </Link>
        </Stack>
      </Card>

      {upcoming.length > 0 ? (
        <section className="mc-recall__upcoming" aria-label="Upcoming reviews">
          <h2 className="mc-h3">Scheduled next</h2>
          <ul className="mc-recall__schedule">
            {upcoming.map((topic) => (
              <li key={topic.cluster} className="mc-recall__scheduled">
                <span className="mc-recall__scheduled-title">{topic.title}</span>
                <span className="mc-muted mc-fineprint">{topic.dueLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
