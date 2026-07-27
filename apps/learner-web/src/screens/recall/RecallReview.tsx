import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { tallyRatings, type Card as RecallCard, type RecallRating } from '@mcat/recall-core';
import {
  useRecallService,
  useRecordReview,
  useSetSuspended,
  useSoftDeleteCard,
} from '../../app/recall-queries';
import { CardHtml } from './CardHtml';

const RATINGS: { rating: RecallRating; label: string; key: string }[] = [
  { rating: 'again', label: 'Again', key: '1' },
  { rating: 'hard', label: 'Hard', key: '2' },
  { rating: 'good', label: 'Good', key: '3' },
  { rating: 'easy', label: 'Easy', key: '4' },
];

export function RecallReview() {
  const service = useRecallService();
  const record = useRecordReview();
  const suspend = useSetSuspended();
  const remove = useSoftDeleteCard();
  const navigate = useNavigate();

  const [queue, setQueue] = useState<RecallCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<RecallRating[]>([]);
  const [elapsedTotal, setElapsedTotal] = useState(0);
  const startRef = useRef<number>(Date.now());
  const undoRef = useRef<{ card: RecallCard; reviewId: string } | null>(null);

  useEffect(() => {
    if (!service) return;
    let active = true;
    void service.getQueue({}).then((cards) => {
      if (!active) return;
      setQueue(cards);
      startRef.current = Date.now();
    });
    return () => {
      active = false;
    };
  }, [service]);

  const current = queue && index < queue.length ? queue[index] : null;

  const advance = useCallback(() => {
    setRevealed(false);
    setIndex((i) => i + 1);
    startRef.current = Date.now();
  }, []);

  const rate = useCallback(
    async (rating: RecallRating) => {
      if (!service || !current || record.isPending) return;
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - startRef.current) / 1000));
      const result = await record.mutateAsync({ cardId: current.id, rating, elapsedSeconds });
      if (result) undoRef.current = { card: current, reviewId: result.review.id };
      setRatings((r) => [...r, rating]);
      setElapsedTotal((t) => t + elapsedSeconds);
      advance();
    },
    [service, current, record, advance],
  );

  const undo = useCallback(async () => {
    if (!service || !undoRef.current || index === 0) return;
    await service.undoReview(undoRef.current.card, undoRef.current.reviewId);
    undoRef.current = null;
    setRatings((r) => r.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    setRevealed(true);
  }, [service, index]);

  const onSuspend = useCallback(async () => {
    if (!current) return;
    await suspend.mutateAsync({ cardId: current.id, suspended: true });
    advance();
  }, [current, suspend, advance]);

  const onDelete = useCallback(async () => {
    if (!current) return;
    await remove.mutateAsync({ cardId: current.id });
    advance();
  }, [current, remove, advance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === 'INPUT')) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        else void rate('good');
        return;
      }
      if (revealed) {
        const match = RATINGS.find((r) => r.key === event.key);
        if (match) {
          event.preventDefault();
          void rate(match.rating);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, rate]);

  if (!service || !queue) {
    return <div className="mc-center mc-muted">Loading your cards…</div>;
  }

  if (queue.length === 0) {
    return (
      <div className="mc-screen">
        <header className="mc-screen__head">
          <h1 className="mc-h1">Recall</h1>
        </header>
        <Card elevated>
          <Stack gap={3}>
            <Eyebrow>Nothing due</Eyebrow>
            <p className="mc-muted">You have no cards due right now. Add cards or import a deck.</p>
            <Link to="/app/recall" className="mc-button mc-button--primary mc-button--lg">
              <span className="mc-button__label">Back to Recall</span>
            </Link>
          </Stack>
        </Card>
      </div>
    );
  }

  if (!current) {
    const tally = tallyRatings(ratings);
    return (
      <div className="mc-screen">
        <header className="mc-screen__head">
          <h1 className="mc-h1">Session complete</h1>
        </header>
        <Card elevated>
          <Stack gap={4}>
            <Eyebrow>Nice work</Eyebrow>
            <p>
              You reviewed <strong>{ratings.length}</strong> card{ratings.length === 1 ? '' : 's'} in
              about <strong>{Math.max(1, Math.round(elapsedTotal / 60))}</strong> min.
            </p>
            <div className="mc-recall__stats">
              <Stat label="Again" value={tally.again} />
              <Stat label="Hard" value={tally.hard} />
              <Stat label="Good" value={tally.good} />
              <Stat label="Easy" value={tally.easy} />
            </div>
            <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/app/recall')}>
              Done
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  const progressPct = (index / queue.length) * 100;

  return (
    <div className="mc-screen mc-recall-review">
      <div className="mc-recall__progresshead">
        <Eyebrow>
          {index + 1} / {queue.length}
        </Eyebrow>
        <Link to="/app/recall" className="mc-textbtn">
          End session
        </Link>
      </div>
      <div
        className="mc-progress"
        role="progressbar"
        aria-valuenow={Math.round(progressPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Review progress"
      >
        <span style={{ width: `${Math.max(4, progressPct)}%` }} />
      </div>

      <Card elevated>
        <Stack gap={4}>
          <CardHtml html={current.frontHtml} className="mc-recall__face mc-recall__front" />
          {revealed ? (
            <>
              <hr className="mc-recall__divider" />
              <CardHtml html={current.backHtml} className="mc-recall__face mc-recall__back" />
            </>
          ) : null}

          {!revealed ? (
            <Button variant="primary" size="lg" fullWidth onClick={() => setRevealed(true)}>
              Show answer <span className="mc-kbd">Space</span>
            </Button>
          ) : (
            <div className="mc-recall__ratings" role="group" aria-label="Rate your recall">
              {RATINGS.map(({ rating, label, key }) => (
                <button
                  key={rating}
                  type="button"
                  className={`mc-recall__rate mc-recall__rate--${rating}`}
                  onClick={() => void rate(rating)}
                  disabled={record.isPending}
                >
                  <span className="mc-recall__rate-label">{label}</span>
                  <span className="mc-kbd">{key}</span>
                </button>
              ))}
            </div>
          )}
        </Stack>
      </Card>

      <div className="mc-recall__toolbar">
        <Link to={`/app/recall/edit/${current.id}`} className="mc-textbtn">
          Edit
        </Link>
        <button type="button" className="mc-textbtn" onClick={() => void onSuspend()}>
          Suspend
        </button>
        <button type="button" className="mc-textbtn" onClick={() => void onDelete()}>
          Delete
        </button>
        <button type="button" className="mc-textbtn" onClick={() => void undo()} disabled={index === 0}>
          Undo
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mc-recall__stat">
      <span className="mc-recall__stat-value">{value}</span>
      <span className="mc-recall__stat-label">{label}</span>
    </div>
  );
}
