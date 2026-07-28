import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { isLeech, recallDayStart, toMillis, type Card as RecallCard } from '@mcat/recall-core';
import { useRecallCards, useRecallLoad } from '../../app/recall-queries';

/** Cards in review with at least this much stability (days) are considered mature. */
const MATURE_STABILITY_DAYS = 21;
const FORECAST_DAYS = 7;

/** Deck query for the summary tiles: include suspended so leeches are counted. */
const DECK_QUERY = { includeSuspended: true } as const;

/** Recall tab landing: due summary + entry points. Flashcards are user-owned facts. */
export function RecallHome() {
  const navigate = useNavigate();
  const load = useRecallLoad();
  const data = load.data;
  const due = data?.due ?? 0;
  const newAvailable = data?.newAvailable ?? 0;
  const nothing = !load.isLoading && due === 0 && newAvailable === 0;

  // Recall's own deck (non-deleted, includes suspended so leeches surface). This
  // is the only source for the glance tiles + forecast — no mastery is read.
  const deck = useRecallCards(DECK_QUERY);
  const cards = deck.data;
  const deckReady = !deck.isLoading && cards !== undefined;
  const hasCards = (cards?.length ?? 0) > 0;
  const emptyDeck = deckReady && !hasCards;

  const stats = useMemo(() => computeDeckStats(cards ?? []), [cards]);
  const forecast = useMemo(() => computeForecast(cards ?? []), [cards]);

  return (
    <div className="mc-screen mc-recall">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Recall</h1>
        <p className="mc-muted">
          Your own flashcards, scheduled with spaced repetition. Private to you, and always here when
          a card is due.
        </p>
      </header>

      <Card elevated>
        <Stack gap={4}>
          {load.isLoading ? (
            <p className="mc-muted">Checking your deck…</p>
          ) : nothing ? (
            <div className="mc-recall__empty">
              <Eyebrow>Your deck is empty</Eyebrow>
              <p className="mc-muted">
                Add a few cards or import an Anki deck and Recall will schedule them for you.
              </p>
            </div>
          ) : due === 0 ? (
            <Stack gap={3}>
              <Eyebrow>All caught up</Eyebrow>
              {newAvailable > 0 ? (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="mc-recall__cta"
                  onClick={() => navigate('/app/recall/review')}
                >
                  Study flashcards
                </Button>
              ) : null}
            </Stack>
          ) : (
            <Stack gap={4}>
              <Eyebrow>Ready to review</Eyebrow>
              <div className="mc-recall__stats">
                <Stat label="Due now" value={due} />
                <Stat label="New" value={newAvailable} />
                <Stat label="~min" value={data?.estimatedMinutesForDue ?? 0} />
              </div>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                className="mc-recall__cta"
                onClick={() => navigate('/app/recall/review')}
              >
                Start review
              </Button>
            </Stack>
          )}

          <div className="mc-recall__actions">
            <Button variant="primary" size="lg" onClick={() => navigate('/app/recall/new')}>
              + Add cards
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate('/app/recall/import')}>
              Import Anki deck
            </Button>
          </div>
        </Stack>
      </Card>

      {hasCards ? (
        <>
          <Card elevated>
            <Stack gap={4}>
              <Eyebrow>Deck at a glance</Eyebrow>
              <div className="mc-recall__stats">
                <Stat label="Total" value={stats.total} />
                <Stat label="New" value={stats.newCount} />
                <Stat label="Learning" value={stats.learning} />
                <Stat label="Review" value={stats.review} />
                <Stat label="Mature" value={stats.mature} />
                <Stat label="Leeches" value={stats.leeches} />
              </div>
            </Stack>
          </Card>

          <Card elevated>
            <Stack gap={4}>
              <Eyebrow>Next 7 days</Eyebrow>
              <div className="mc-recall__forecast" role="img" aria-label={forecast.summary}>
                {forecast.days.map((day) => {
                  const height = Math.round((day.count / forecast.max) * 100);
                  return (
                    <div className="mc-recall__forecast-col" key={day.key}>
                      <span className="mc-recall__forecast-count" aria-hidden="true">
                        {day.count}
                      </span>
                      <div className="mc-recall__forecast-track" aria-hidden="true">
                        <div
                          className={`mc-recall__forecast-bar${day.count === 0 ? ' mc-recall__forecast-bar--empty' : ''}`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span
                        className={`mc-recall__forecast-label${day.isToday ? ' mc-recall__forecast-label--today' : ''}`}
                        aria-hidden="true"
                      >
                        {day.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Stack>
          </Card>
        </>
      ) : emptyDeck ? (
        <Card elevated>
          <Stack gap={3}>
            <Eyebrow>Build a strong deck</Eyebrow>
            <ul className="mc-recall__tips">
              <li>
                <strong>Keep each card to one fact.</strong> Atomic cards are quicker to learn and
                schedule cleanly.
              </li>
              <li>
                <strong>Use cloze deletions</strong> for lists, sequences, and pathways instead of
                one crowded answer.
              </li>
              <li>
                <strong>Add an image or a mnemonic</strong> to anchor the cards you keep missing.
              </li>
              <li>
                <strong>Import an Anki deck</strong> to build momentum without starting from scratch.
              </li>
            </ul>
          </Stack>
        </Card>
      ) : null}
    </div>
  );
}

interface DeckStats {
  total: number;
  newCount: number;
  learning: number;
  review: number;
  mature: number;
  leeches: number;
}

/** Glance tiles from Recall's own deck. Suspended/soft-deleted are excluded from
 *  the state buckets; leeches (auto-suspended) are counted on their own. */
function computeDeckStats(cards: readonly RecallCard[]): DeckStats {
  const active = cards.filter((card) => !card.suspended);
  let newCount = 0;
  let learning = 0;
  let review = 0;
  let mature = 0;
  for (const card of active) {
    const state = card.scheduling.state;
    if (state === 'new') {
      newCount += 1;
    } else if (state === 'learning' || state === 'relearning') {
      learning += 1;
    } else if (state === 'review') {
      review += 1;
      if (card.scheduling.stability >= MATURE_STABILITY_DAYS) mature += 1;
    }
  }
  const leeches = cards.filter((card) => isLeech(card)).length;
  return { total: active.length, newCount, learning, review, mature, leeches };
}

interface ForecastDay {
  key: string;
  label: string;
  count: number;
  isToday: boolean;
}

interface Forecast {
  days: ForecastDay[];
  max: number;
  summary: string;
}

/** How many active learning/review cards come due on each of the next 7 recall
 *  days. Overdue cards fold into "today"; new cards are not scheduled yet. */
function computeForecast(cards: readonly RecallCard[]): Forecast {
  const base = recallDayStart(new Date());
  const bounds: number[] = [];
  for (let i = 0; i <= FORECAST_DAYS; i += 1) {
    const day = new Date(base);
    day.setDate(day.getDate() + i);
    bounds.push(day.getTime());
  }

  const counts = new Array<number>(FORECAST_DAYS).fill(0);
  for (const card of cards) {
    if (card.suspended) continue;
    const state = card.scheduling.state;
    if (state !== 'learning' && state !== 'review' && state !== 'relearning') continue;
    const dueMs = toMillis(card.scheduling.due);
    let index = -1;
    if (dueMs < bounds[0]) {
      index = 0;
    } else {
      for (let i = 0; i < FORECAST_DAYS; i += 1) {
        if (dueMs >= bounds[i] && dueMs < bounds[i + 1]) {
          index = i;
          break;
        }
      }
    }
    if (index >= 0) counts[index] += 1;
  }

  const days: ForecastDay[] = counts.map((count, i) => {
    const date = new Date(bounds[i]);
    return {
      key: date.toISOString(),
      label: i === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }),
      count,
      isToday: i === 0,
    };
  });
  const max = Math.max(1, ...counts);
  const summary = `Cards due over the next 7 days — ${days
    .map((day) => `${day.label}: ${day.count}`)
    .join(', ')}.`;
  return { days, max, summary };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mc-recall__stat">
      <span className="mc-recall__stat-value">{value}</span>
      <span className="mc-recall__stat-label">{label}</span>
    </div>
  );
}
