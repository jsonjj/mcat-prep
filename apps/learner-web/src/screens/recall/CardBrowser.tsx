import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import type { Card as RecallCard, CardState } from '@mcat/recall-core';
import {
  useRecallCards,
  useRecallTrash,
  usePurgeCard,
  useResetCard,
  useRestoreCard,
  useSetSuspended,
  useSoftDeleteCard,
} from '../../app/recall-queries';
import { htmlToText } from '../../recall/adapters/html-sanitize';

const STATES: CardState[] = ['new', 'learning', 'review', 'relearning'];

export function CardBrowser() {
  const cardsQuery = useRecallCards({ includeSuspended: true });
  const trashQuery = useRecallTrash();
  const suspend = useSetSuspended();
  const reset = useResetCard();
  const remove = useSoftDeleteCard();
  const restore = useRestoreCard();
  const purge = usePurgeCard();

  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [state, setState] = useState<CardState | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showTrash, setShowTrash] = useState(false);

  const allCards = cardsQuery.data ?? [];
  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const card of allCards) for (const t of card.tags) set.add(t);
    return [...set].sort();
  }, [allCards]);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return allCards.filter((card) => {
      if (state && card.scheduling.state !== state) return false;
      if (tag && !card.tags.includes(tag)) return false;
      if (needle) {
        const hay = `${htmlToText(card.frontHtml)} ${htmlToText(card.backHtml)} ${card.tags.join(
          ' ',
        )}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [allCards, search, tag, state]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: (cardId: string) => Promise<unknown>) => {
    await Promise.all([...selected].map((id) => action(id)));
    setSelected(new Set());
  };

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Card browser</h1>
        <p className="mc-muted">Search, filter, edit, and manage your cards.</p>
      </header>

      <div className="mc-recall__filters">
        <input
          type="search"
          className="mc-input"
          placeholder="Search front, back, or tags"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search cards"
        />
        <select
          className="mc-input"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="mc-input"
          value={state}
          onChange={(e) => setState(e.target.value as CardState | '')}
          aria-label="Filter by state"
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Link to="/app/recall/new" className="mc-button mc-button--secondary">
          <span className="mc-button__label">+ Add</span>
        </Link>
      </div>

      {selected.size > 0 ? (
        <div className="mc-recall__bulk" role="group" aria-label="Bulk actions">
          <span className="mc-muted">{selected.size} selected</span>
          <button
            type="button"
            className="mc-textbtn"
            onClick={() => void runBulk((id) => suspend.mutateAsync({ cardId: id, suspended: true }))}
          >
            Suspend
          </button>
          <button
            type="button"
            className="mc-textbtn"
            onClick={() => void runBulk((id) => reset.mutateAsync({ cardId: id }))}
          >
            Reset
          </button>
          <button
            type="button"
            className="mc-textbtn"
            onClick={() => void runBulk((id) => remove.mutateAsync({ cardId: id }))}
          >
            Delete
          </button>
        </div>
      ) : null}

      {cardsQuery.isLoading ? (
        <p className="mc-muted">Loading cards…</p>
      ) : filtered.length === 0 ? (
        <Callout tone="info">No cards match. Try clearing the filters or adding cards.</Callout>
      ) : (
        <ul className="mc-recall__list">
          {filtered.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              selected={selected.has(card.id)}
              onToggle={() => toggle(card.id)}
              onSuspend={() =>
                void suspend.mutateAsync({ cardId: card.id, suspended: !card.suspended })
              }
              onDelete={() => void remove.mutateAsync({ cardId: card.id })}
            />
          ))}
        </ul>
      )}

      <section className="mc-recall__trash">
        <button
          type="button"
          className="mc-textbtn"
          aria-expanded={showTrash}
          onClick={() => setShowTrash((v) => !v)}
        >
          {showTrash ? 'Hide' : 'Show'} Trash ({trashQuery.data?.length ?? 0})
        </button>
        {showTrash ? (
          <Card elevated>
            <Stack gap={3}>
              <Eyebrow>Trash</Eyebrow>
              {(trashQuery.data ?? []).length === 0 ? (
                <p className="mc-muted">Trash is empty.</p>
              ) : (
                <ul className="mc-recall__list">
                  {(trashQuery.data ?? []).map((card) => (
                    <li key={card.id} className="mc-recall__row">
                      <span className="mc-recall__row-front">{htmlToText(card.frontHtml)}</span>
                      <span className="mc-recall__row-actions">
                        <button
                          type="button"
                          className="mc-textbtn"
                          onClick={() => void restore.mutateAsync({ cardId: card.id })}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="mc-textbtn"
                          onClick={() => void purge.mutateAsync({ cardId: card.id })}
                        >
                          Delete forever
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Stack>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function CardRow({
  card,
  selected,
  onToggle,
  onSuspend,
  onDelete,
}: {
  card: RecallCard;
  selected: boolean;
  onToggle: () => void;
  onSuspend: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`mc-recall__row ${card.suspended ? 'mc-recall__row--suspended' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label="Select card"
        className="mc-recall__row-check"
      />
      <Link to={`/app/recall/edit/${card.id}`} className="mc-recall__row-front">
        {htmlToText(card.frontHtml) || '(empty)'}
      </Link>
      <span className="mc-recall__row-tags">{card.tags.join(', ')}</span>
      <span className="mc-recall__row-state">{card.suspended ? 'suspended' : card.scheduling.state}</span>
      <span className="mc-recall__row-actions">
        <button type="button" className="mc-textbtn" onClick={onSuspend}>
          {card.suspended ? 'Unsuspend' : 'Suspend'}
        </button>
        <button type="button" className="mc-textbtn" onClick={onDelete}>
          Delete
        </button>
      </span>
    </li>
  );
}
