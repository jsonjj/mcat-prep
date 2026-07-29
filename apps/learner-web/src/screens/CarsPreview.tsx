import { useMemo, useState } from 'react';
import { Button, Callout, Card, Eyebrow, Inline, Stack } from '@mcat/ui-web';
import {
  EXAMPLE_SET,
  PERFORMANCE_SET,
  SKILL_SET,
  passageWordCount,
  type GeneratedItem,
  type GeneratedPassageSet,
} from '@mcat/cars-generation';

/**
 * CARS generator preview — sit the hand-authored sets and report what went wrong.
 *
 * This is a reviewing surface, not a learner surface: it deliberately sits outside
 * AppShell and mints no evidence. Nothing here touches the authority kernel, because a
 * sitting on fixtures must not move a mastery estimate.
 *
 * It captures three things per item, since right/wrong alone is nearly useless at n=1:
 *   picked      — which distractor attracted, if any. Tests whether the families predict.
 *   eliminated  — options struck before answering. An option struck on sight is inert,
 *                 and inert distractors are the failure mode the checks cannot catch.
 *   confidence  — a confident miss means the key is indefensible, not that the item is hard.
 */

const SETS: readonly GeneratedPassageSet[] = [SKILL_SET, PERFORMANCE_SET, EXAMPLE_SET];

type Label = string;

interface Answer {
  picked?: Label;
  eliminated: Label[];
  confidence?: 1 | 2 | 3;
}

const EMPTY: Answer = { eliminated: [] };

const CONFIDENCE: Record<1 | 2 | 3, string> = { 1: 'Guess', 2: 'Unsure', 3: 'Confident' };

interface Flat {
  set: GeneratedPassageSet;
  item: GeneratedItem;
  indexInSet: number;
}

const FLAT: readonly Flat[] = SETS.flatMap((set) =>
  set.items.map((item, indexInSet) => ({ set, item, indexInSet })),
);

export function CarsPreview() {
  const [phase, setPhase] = useState<'intro' | 'sitting' | 'results'>('intro');
  const [cursor, setCursor] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const answeredCount = Object.values(answers).filter((a) => a.picked).length;

  if (phase === 'intro') {
    return (
      <main className="mc-page" style={{ maxWidth: '46rem', margin: '0 auto', padding: 'var(--mc-space-6)' }}>
        <Stack gap={5}>
          <Stack gap={2}>
            <Eyebrow>Generator review</Eyebrow>
            <h1>CARS preview sitting</h1>
            <p>
              {SETS.length} passages, {FLAT.length} items. All were hand-authored against the
              generator&rsquo;s blueprint constraints and all pass the deterministic harness. Read
              them as the target the generator aims at — a careful author beats the pipeline, so this
              is the optimistic case rather than a sample of live output.
            </p>
          </Stack>

          <Callout tone="info" title="What one examinee can and cannot establish">
            <p>
              No difficulty or discrimination estimate: those need a population. What a strong reader
              gives is flaw detection — a wrong answer here more likely means a broken key than a
              hard item. So strike options as you rule them out. The strike count is the real
              measurement: if you rule out three of four on most items, the distractors did no work.
            </p>
          </Callout>

          <Card>
            <Stack gap={3}>
              <strong>Sit it at pace</strong>
              <p style={{ margin: 0 }}>
                Real CARS allows roughly 10 minutes per passage. Untimed reading hides difficulty.
              </p>
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>Passage</th>
                    <th>Words</th>
                    <th>Items</th>
                  </tr>
                </thead>
                <tbody>
                  {SETS.map((s) => (
                    <tr key={s.passage.id}>
                      <td>{s.passage.title}</td>
                      <td>{passageWordCount(s.passage)}</td>
                      <td>{s.items.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Stack>
          </Card>

          <Inline gap={3}>
            <Button
              onClick={() => {
                if (startedAt === 0) setStartedAt(Date.now());
                setPhase('sitting');
              }}
            >
              {answeredCount > 0 ? 'Resume' : 'Begin'}
            </Button>
            {answeredCount > 0 ? (
              <Button
                variant="text"
                onClick={() => {
                  setAnswers({});
                  setCursor(0);
                  setStartedAt(0);
                  setShowAll(false);
                }}
              >
                Start over
              </Button>
            ) : null}
          </Inline>
        </Stack>
      </main>
    );
  }

  if (phase === 'results') {
    return (
      <Results
        answers={answers}
        elapsedMs={startedAt > 0 ? Date.now() - startedAt : 0}
        showAll={showAll}
        onShowAll={() => setShowAll(true)}
        onBack={() => setPhase('sitting')}
        onReset={() => {
          setAnswers({});
          setCursor(0);
          setStartedAt(0);
          setShowAll(false);
          setPhase('intro');
        }}
      />
    );
  }

  const { set, item, indexInSet } = FLAT[cursor]!;
  const answer = answers[item.id] ?? EMPTY;

  const update = (next: Partial<Answer>) =>
    setAnswers((prev) => ({ ...prev, [item.id]: { ...EMPTY, ...prev[item.id], ...next } }));

  return (
    <main className="mc-page" style={{ maxWidth: '84rem', margin: '0 auto', padding: 'var(--mc-space-5)' }}>
      <Stack gap={4}>
        <Inline gap={4} style={{ justifyContent: 'space-between' }}>
          <Stack gap={1}>
            <Eyebrow>{set.passage.title}</Eyebrow>
            <span style={{ color: 'var(--mc-text-muted)', fontSize: '0.85rem' }}>
              Question {indexInSet + 1} of {set.items.length} in this passage · item {cursor + 1} of{' '}
              {FLAT.length} overall · {answeredCount} answered
            </span>
          </Stack>
          <Button variant="secondary" onClick={() => setPhase('results')}>
            Finish and score
          </Button>
        </Inline>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
            gap: 'var(--mc-space-5)',
            alignItems: 'start',
          }}
        >
          <Card style={{ maxHeight: '74vh', overflowY: 'auto' }}>
            <Stack gap={3}>
              {set.passage.paragraphs.map((p, i) => (
                <p key={i} style={{ margin: 0, lineHeight: 1.7 }}>
                  {p}
                </p>
              ))}
            </Stack>
          </Card>

          <Stack gap={4}>
            <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{item.stem}</p>

            <Stack gap={2}>
              {item.choices.map((choice) => {
                const struck = answer.eliminated.includes(choice.label);
                const picked = answer.picked === choice.label;
                return (
                  <div
                    key={choice.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 'var(--mc-space-2)',
                      alignItems: 'center',
                      border: `1px solid ${picked ? 'var(--mc-accent)' : 'var(--mc-border)'}`,
                      borderRadius: 'var(--mc-radius-2)',
                      padding: 'var(--mc-space-3)',
                      opacity: struck && !picked ? 0.5 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => update({ picked: choice.label })}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        lineHeight: 1.5,
                        textDecoration: struck ? 'line-through' : 'none',
                      }}
                    >
                      <span style={{ color: 'var(--mc-text-muted)', marginRight: '0.5rem' }}>
                        {choice.label}.
                      </span>
                      {choice.text}
                    </button>
                    <Button
                      variant="text"
                      onClick={() =>
                        update({
                          eliminated: struck
                            ? answer.eliminated.filter((l) => l !== choice.label)
                            : [...answer.eliminated, choice.label],
                        })
                      }
                    >
                      {struck ? 'unstrike' : 'strike'}
                    </Button>
                  </div>
                );
              })}
            </Stack>

            <Stack gap={2}>
              <span style={{ color: 'var(--mc-text-muted)', fontSize: '0.85rem' }}>
                How sure are you?
              </span>
              <Inline gap={2}>
                {([1, 2, 3] as const).map((level) => (
                  <Button
                    key={level}
                    variant={answer.confidence === level ? 'secondary' : 'text'}
                    onClick={() => update({ confidence: level })}
                  >
                    {CONFIDENCE[level]}
                  </Button>
                ))}
              </Inline>
            </Stack>

            <Inline gap={2}>
              <Button variant="text" disabled={cursor === 0} onClick={() => setCursor(cursor - 1)}>
                Previous
              </Button>
              {cursor === FLAT.length - 1 ? (
                <Button onClick={() => setPhase('results')}>Score it</Button>
              ) : (
                <Button onClick={() => setCursor(cursor + 1)}>Next</Button>
              )}
            </Inline>
          </Stack>
        </div>
      </Stack>
    </main>
  );
}

function Results({
  answers,
  elapsedMs,
  showAll,
  onShowAll,
  onBack,
  onReset,
}: {
  answers: Record<string, Answer>;
  elapsedMs: number;
  showAll: boolean;
  onShowAll: () => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const scored = useMemo(
    () =>
      FLAT.map(({ set, item }) => {
        const answer = answers[item.id] ?? EMPTY;
        const chosen = answer.picked
          ? item.rationales.find((r) => r.label === answer.picked)
          : undefined;
        return {
          set,
          item,
          answer,
          correct: answer.picked === item.correctChoice,
          family: chosen?.family,
        };
      }),
    [answers],
  );

  const answered = scored.filter((s) => s.answer.picked);
  const right = scored.filter((s) => s.correct).length;
  const wrong = answered.filter((s) => !s.correct);
  const meanStruck =
    answered.length > 0
      ? answered.reduce((n, s) => n + s.answer.eliminated.length, 0) / answered.length
      : 0;

  // A family that never attracts a pick is decorative. This is the validation payload.
  const familyHits = new Map<string, number>();
  for (const s of wrong) if (s.family) familyHits.set(s.family, (familyHits.get(s.family) ?? 0) + 1);

  const confidentMisses = wrong.filter((s) => s.answer.confidence === 3);
  const luckyGuesses = scored.filter((s) => s.correct && s.answer.confidence === 1);
  const minutes = Math.round(elapsedMs / 60000);

  return (
    <main className="mc-page" style={{ maxWidth: '54rem', margin: '0 auto', padding: 'var(--mc-space-6)' }}>
      <Stack gap={5}>
        <Stack gap={1}>
          <Eyebrow>Generator review</Eyebrow>
          <h1>
            {right} of {FLAT.length} correct
          </h1>
          <p style={{ margin: 0, color: 'var(--mc-text-muted)' }}>
            {minutes > 0 ? `${minutes} min · ` : ''}
            {meanStruck.toFixed(1)} options struck per item on average
          </p>
        </Stack>

        {answered.length < FLAT.length ? (
          <Callout tone="warning" title="Incomplete">
            <p>
              {FLAT.length - answered.length} item(s) unanswered. The reads below cover only what you
              answered.
            </p>
          </Callout>
        ) : null}

        {meanStruck >= 2.5 && answered.length > 0 ? (
          <Callout tone="warning" title="The distractors are doing very little">
            <p>
              You ruled out {meanStruck.toFixed(1)} of 4 options per item on average. That is the
              flatness problem directly: the items are answerable by elimination, which no
              deterministic check can detect. It is the strongest argument for real response data.
            </p>
          </Callout>
        ) : null}

        {wrong.length > 0 ? (
          <Stack gap={3}>
            <h2>Every miss, as a bug report against the key</h2>
            {wrong.map((s) => (
              <Card key={s.item.id}>
                <Stack gap={3}>
                  <Inline gap={3} style={{ justifyContent: 'space-between' }}>
                    <Eyebrow>{s.item.archetype}</Eyebrow>
                    <span style={{ color: 'var(--mc-text-muted)', fontSize: '0.85rem' }}>
                      picked {s.answer.picked} · key {s.item.correctChoice}
                      {s.family ? ` · ${s.family}` : ''}
                    </span>
                  </Inline>
                  <p style={{ margin: 0, fontWeight: 600 }}>{s.item.stem}</p>
                  <Stack gap={2}>
                    <div>
                      <Eyebrow>Why {s.answer.picked} is wrong</Eyebrow>
                      <p style={{ margin: 0 }}>
                        {s.item.rationales.find((r) => r.label === s.answer.picked)?.rationale}
                      </p>
                    </div>
                    <div>
                      <Eyebrow>Why {s.item.correctChoice} is right</Eyebrow>
                      <p style={{ margin: 0 }}>
                        {s.item.rationales.find((r) => r.label === s.item.correctChoice)?.rationale}
                      </p>
                    </div>
                  </Stack>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : answered.length > 0 ? (
          <Callout tone="warning" title="A clean sweep is itself a finding">
            <p>
              Nothing here separated you from anyone. Fair, answerable, and not discriminating — which
              is exactly the limitation of authoring without response data.
            </p>
          </Callout>
        ) : null}

        {familyHits.size > 0 ? (
          <Card>
            <Stack gap={3}>
              <strong>Which distractor families attracted you</strong>
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>Family</th>
                    <th>Picks</th>
                  </tr>
                </thead>
                <tbody>
                  {[...familyHits.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([family, n]) => (
                      <tr key={family}>
                        <td>{family}</td>
                        <td>{n}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Stack>
          </Card>
        ) : null}

        {confidentMisses.length > 0 ? (
          <Callout tone="danger" title={`${confidentMisses.length} confident miss(es)`}>
            <p>
              The strongest signal available here: either the key is indefensible or the distractor is
              genuinely better than the key. Re-examine{' '}
              {confidentMisses.map((s) => s.item.id).join(', ')}.
            </p>
          </Callout>
        ) : null}

        {luckyGuesses.length > 0 ? (
          <Callout tone="info" title={`${luckyGuesses.length} correct but guessed`}>
            <p>
              {luckyGuesses.map((s) => s.item.id).join(', ')} — the key may be underdetermined even
              though you landed on it.
            </p>
          </Callout>
        ) : null}

        <Card>
          <table className="mc-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Archetype</th>
                <th>Skill</th>
                <th>Pick</th>
                <th>Key</th>
                <th>Confidence</th>
                <th>Struck</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((s) => (
                <tr key={s.item.id}>
                  <td>{s.item.id}</td>
                  <td>{s.item.archetype}</td>
                  <td>{s.item.skill}</td>
                  <td>{s.answer.picked ?? '—'}</td>
                  <td>{s.item.correctChoice}</td>
                  <td>{s.answer.confidence ? CONFIDENCE[s.answer.confidence] : '—'}</td>
                  <td>{s.answer.eliminated.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {showAll ? (
          <Stack gap={3}>
            <h2>Every rationale</h2>
            {FLAT.map(({ item }) => (
              <Card key={item.id}>
                <Stack gap={2}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{item.stem}</p>
                  {item.rationales.map((r) => (
                    <div key={r.label}>
                      <Eyebrow>
                        {r.label}
                        {r.family ? ` · ${r.family}` : ' · key'}
                      </Eyebrow>
                      <p style={{ margin: 0 }}>{r.rationale}</p>
                    </div>
                  ))}
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <Inline gap={3}>
            <Button variant="secondary" onClick={onShowAll}>
              Show all rationales
            </Button>
          </Inline>
        )}

        <Inline gap={3}>
          <Button variant="text" onClick={onBack}>
            Back to the questions
          </Button>
          <Button variant="text" onClick={onReset}>
            Start over
          </Button>
        </Inline>
      </Stack>
    </main>
  );
}
