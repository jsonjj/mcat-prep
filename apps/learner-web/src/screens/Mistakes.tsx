import { useRef, useState, type KeyboardEvent, type SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import {
  CLUSTER_INFO,
  type CarsReasoningPatternView,
  type ErrorEntryView,
  type MistakePatternView,
  type SkillCluster,
} from '@mcat/contracts';
import { ExplainAnotherWay } from '../components/ExplainAnotherWay';
import {
  useCarsReasoningPatterns,
  useErrorLog,
  useMistakePatterns,
  useShakyWins,
} from '../app/queries';

/**
 * Mistakes — the two surfaces of docs/design/error-handling-design.md §6, ordered by
 * calibration (WS1) and naming the specific trap (WS2/WS3), laid out as a low-scroll
 * two-pane master–detail ("Hybrid C"): a GROUP TABLIST + a compact scannable list on
 * the LEFT, and a FOCUSED action card for the selected row on the RIGHT.
 *
 * The four groups (tabs) are:
 * A. "To fix" — the misses themselves, CONFIDENTLY-WRONG first (a fast, sure miss is
 *    the best thing to correct — hypercorrection), each naming what was picked, what
 *    was right, the refutation shown at the time, and the misconception behind the
 *    picked distractor.
 * B. "Patterns" — recurring misses grouped at KC / cluster grain, with denominators,
 *    and — once a pattern is real — the misconception most leaned toward.
 * C. "Wins" — "shaky wins": answers that were right but came slowly or in a still-weak
 *    KC, worth another rep to lock in.
 * D. "CARS" — reasoning-pattern repairs from weak duels (WS7).
 *
 * Every row's primary action is "try again", never "read": it routes into the adaptive
 * practice queue with a KC/cluster focus, and that queue's own exposure/repair seam
 * picks a FRESH unseen item, so a re-attempt is real evidence rather than a re-serve of
 * the logged question.
 *
 * Deliberately absent: a self-reported cause headline (κ = 0.000–0.063 between experts,
 * §2.3), a running mistake total, a streak, and any cohort comparison (§6.6 —
 * `question_stats` carries no per-choice base rates to compare against).
 */

/** How many questions a "try again" session serves. */
const RETRY_SET_SIZE = 5;

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Confidently-wrong misses sort ahead of the rest; recent first within each band. */
const missOrder = (a: ErrorEntryView, b: ErrorEntryView): number => {
  const rank = (e: ErrorEntryView): number => (e.calibration === 'confidently_wrong' ? 0 : 1);
  return rank(a) - rank(b) || Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
};

/** Map an error's 15-cluster rollup to its section, so "Step by step" can gate on C/P. */
const sectionForCluster = (cluster: string | null): string | null =>
  cluster !== null && cluster in CLUSTER_INFO ? CLUSTER_INFO[cluster as SkillCluster].section : null;

/** Local, self-contained glyphs for the focused card (keeps the change in this file). */
const glyphProps = (p: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...p,
});
const IconCircleX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...glyphProps(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
);
const IconCircleCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...glyphProps(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.3 12.4l2.4 2.4 4.8-5.2" />
  </svg>
);
const IconTrap = (p: SVGProps<SVGSVGElement>) => (
  <svg {...glyphProps(p)}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);
const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...glyphProps({ width: 18, height: 18, ...p })}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
/** Calm "all caught up" mark for the empty state: a check inside a soft circle. */
const IconCaughtUp = (p: SVGProps<SVGSVGElement>) => (
  <svg width={96} height={96} viewBox="0 0 96 96" fill="none" aria-hidden="true" {...p}>
    <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
    <circle cx="48" cy="48" r="26" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <path
      d="M37 48.5l7.4 7.4L60 40.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type TabKey = 'tofix' | 'patterns' | 'wins' | 'cars';
const TAB_ORDER: readonly TabKey[] = ['tofix', 'patterns', 'wins', 'cars'];
const TAB_LABEL: Record<TabKey, string> = {
  tofix: 'To fix',
  patterns: 'Patterns',
  wins: 'Wins',
  cars: 'CARS',
};

/** Group-level context for the active tab, preserved from the old section copy. */
const TAB_CAPTION: Record<TabKey, string> = {
  tofix: 'The ones you were sure about come first — each hands you a fresh question, not the same one.',
  patterns: 'Recurring misses grouped by knowledge area, always shown with the denominator.',
  wins: 'You got these right, but slowly or in an area that isn’t solid yet — a fresh rep makes the win stick.',
  cars: 'A recent CARS Duel came in below the mark on one kind of reasoning. Each names the skill and hands you a real CARS passage — it clears when you next read a passage in that skill correctly.',
};

/** Per-group empty states (shown when a tab has no rows but another group does). */
const EMPTY_COPY: Record<TabKey, string> = {
  tofix: 'No open misses right now — nice work.',
  patterns: 'No recurring patterns yet. They appear once there’s evidence across several questions.',
  wins: 'No shaky wins to lock in right now.',
  cars: 'No CARS reasoning repairs open right now.',
};

/** One selectable row in the master list, discriminated by its source group. */
type Row =
  | { kind: 'miss'; id: string; entry: ErrorEntryView }
  | { kind: 'pattern'; id: string; pattern: MistakePatternView }
  | { kind: 'win'; id: string; entry: ErrorEntryView }
  | { kind: 'cars'; id: string; pattern: CarsReasoningPatternView };

const tabDomId = (k: TabKey): string => `mc-mtab-${k}`;
const rowDomId = (id: string): string => `mc-mrow-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
const DESKTOP_QUERY = '(min-width: 980px)';

export function Mistakes() {
  const errors = useErrorLog();
  const shakyWins = useShakyWins();
  const patterns = useMistakePatterns();
  const carsPatterns = useCarsReasoningPatterns();
  const location = useLocation();
  const navigate = useNavigate();
  const [showResolved, setShowResolved] = useState(false);
  // `picked`/`pickedRowId` are null until the learner interacts, so the view lands on
  // the first non-empty group with its first row auto-selected.
  const [picked, setPicked] = useState<TabKey | null>(null);
  const [pickedRowId, setPickedRowId] = useState<string | null>(null);
  // Narrow-screen only: whether the detail pane is showing over the list.
  const [detailOpen, setDetailOpen] = useState(false);
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const detailRef = useRef<HTMLDivElement | null>(null);

  // Today's Path routes its "Review Mistakes" slot here and expects a way back that
  // marks the activity complete.
  const navState = location.state as { returnTo?: string; activityId?: string } | null;
  const returnTo = navState?.returnTo;
  const activityId = navState?.activityId;

  const all = errors.data ?? [];
  const open = all.filter((e) => !e.resolved);
  const resolvedCount = all.length - open.length;
  const misses = [...(showResolved ? all : open)].sort(missOrder);
  const shaky = shakyWins.data ?? [];
  const patternRows = patterns.data ?? [];
  // WS7: CARS reasoning-pattern repairs. Open ones show always; cleared ones join
  // behind the same "show cleared" filter as the miss list.
  const carsAll = carsPatterns.data ?? [];
  const carsCleared = carsAll.filter((p) => p.resolved).length;
  const carsRows = showResolved ? carsAll : carsAll.filter((p) => !p.resolved);

  const rowsByTab: Record<TabKey, Row[]> = {
    tofix: misses.map((e) => ({ kind: 'miss', id: `miss:${e.questionId}`, entry: e })),
    patterns: patternRows.map((p) => ({ kind: 'pattern', id: `pattern:${p.grain}:${p.key}`, pattern: p })),
    wins: shaky.map((e) => ({ kind: 'win', id: `win:${e.questionId}`, entry: e })),
    cars: carsRows.map((p) => ({ kind: 'cars', id: `cars:${p.skill}:${p.questionId}`, pattern: p })),
  };

  const totalRows = TAB_ORDER.reduce((n, k) => n + rowsByTab[k].length, 0);
  const nothingToShow = totalRows === 0;
  const hiddenCleared = showResolved ? 0 : resolvedCount + carsCleared;

  const firstNonEmpty = TAB_ORDER.find((k) => rowsByTab[k].length > 0) ?? 'tofix';
  const activeTab = picked ?? firstNonEmpty;
  const activeRows = rowsByTab[activeTab];
  const selectedRow = activeRows.find((r) => r.id === pickedRowId) ?? activeRows[0] ?? null;
  const selectedIndex = selectedRow ? activeRows.findIndex((r) => r.id === selectedRow.id) : -1;

  /**
   * Hand the re-attempt to the ordinary practice queue. The focus token narrows it to
   * the missed area; the queue's exposure/repair seam is what guarantees the item is
   * fresh, so there is no second selector here. When Today's Path sent the learner
   * here, its return contract rides along, so finishing the re-attempt completes the
   * Review Mistakes activity.
   */
  const tryAgain = (focus: string | null): void => {
    navigate('/app/practice/session', {
      state: {
        x: RETRY_SET_SIZE,
        ...(focus === null ? {} : { focus }),
        ...(returnTo === undefined ? {} : { returnTo, activityId }),
      },
    });
  };

  const isDesktop = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;

  const selectTab = (k: TabKey): void => {
    setPicked(k);
    setPickedRowId(null);
    setDetailOpen(false);
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = TAB_ORDER.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === -1) return;
    e.preventDefault();
    const key = TAB_ORDER[next]!;
    selectTab(key);
    tabRefs.current[key]?.focus();
  };

  /** Select a row; on narrow screens this also opens the detail pane over the list. */
  const openRow = (row: Row): void => {
    setPickedRowId(row.id);
    if (!isDesktop()) {
      setDetailOpen(true);
      window.requestAnimationFrame(() => detailRef.current?.focus());
    }
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const last = activeRows.length - 1;
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(index + 1, last)
          : e.key === 'ArrowUp'
            ? Math.max(index - 1, 0)
            : e.key === 'Home'
              ? 0
              : last;
      const nextRow = activeRows[nextIdx];
      if (nextRow) {
        setPickedRowId(nextRow.id);
        rowRefs.current[nextRow.id]?.focus();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const row = activeRows[index];
      if (row) openRow(row);
    }
  };

  const clearedCount = activeTab === 'cars' ? carsCleared : resolvedCount;
  const showClearedToggle = (activeTab === 'tofix' || activeTab === 'cars') && clearedCount > 0;

  const panelHeading =
    activeTab === 'tofix'
      ? showResolved
        ? 'All misses'
        : 'Still open'
      : activeTab === 'patterns'
        ? 'What keeps coming up'
        : activeTab === 'wins'
          ? 'Wins worth locking in'
          : 'CARS reasoning patterns';

  // The four-group tablist. It anchors both surfaces — the master–detail list and the
  // all-caught-up launchpad — so the empty state still shows every group at zero.
  const tabList = (
    <div role="tablist" aria-label="Mistake groups" className="mc-mistakes__tabs">
      {TAB_ORDER.map((k, i) => (
        <button
          key={k}
          type="button"
          role="tab"
          id={tabDomId(k)}
          aria-selected={k === activeTab}
          aria-controls="mc-mistakes-panel"
          tabIndex={k === activeTab ? 0 : -1}
          ref={(el) => {
            tabRefs.current[k] = el;
          }}
          className="mc-mistakes__tab"
          onClick={() => selectTab(k)}
          onKeyDown={(e) => onTabKeyDown(e, i)}
        >
          {TAB_LABEL[k]} ({rowsByTab[k].length})
        </button>
      ))}
    </div>
  );

  return (
    <div className={`mc-screen mc-mistakes${detailOpen ? ' mc-mistakes--detailopen' : ''}`}>
      <header className="mc-screen__head">
        <h1 className="mc-h1">Mistakes</h1>
        <p className="mc-muted">
          Each miss keeps the question, the answer you picked, and why it missed — then hands you a
          fresh question in the same area, never the same one.
        </p>
      </header>

      {returnTo ? (
        <Callout tone="info" title="From today’s path">
          <Stack gap={3}>
            <p className="mc-fineprint">
              Work through the misses below — each one hands you a fresh question in the same area.
            </p>
            <Button
              variant="primary"
              onClick={() => navigate(returnTo, { state: { completedActivityId: activityId } })}
            >
              Done — back to plan
            </Button>
          </Stack>
        </Callout>
      ) : null}

      {nothingToShow ? (
        // Empty state: keep the four-group tablist (all at 0) above a calm launchpad
        // that points forward into practice rather than dead-ending on a Callout.
        <div className="mc-mistakes__solo">
          <div className="mc-mistakes__tabsrow">{tabList}</div>
          <Card
            elevated
            as="section"
            className="mc-caughtup"
            id="mc-mistakes-panel"
            role="tabpanel"
            aria-labelledby={tabDomId(activeTab)}
          >
            <IconCaughtUp className="mc-caughtup__art" />
            <h2 className="mc-caughtup__title">You’re all caught up</h2>
            <p className="mc-caughtup__sub">
              No mistakes to review right now — every miss lands here, worst-first, so you can fix it
              fast.
            </p>
            <div className="mc-caughtup__actions">
              <Button variant="primary" onClick={() => navigate('/app/practice')}>
                Do practice questions
              </Button>
              <Button variant="secondary" onClick={() => navigate('/app/practice')}>
                Take a practice test
              </Button>
              <Button variant="secondary" onClick={() => navigate('/app/today')}>
                Back to today’s plan
              </Button>
            </div>
            {hiddenCleared > 0 ? (
              <Button variant="text" onClick={() => setShowResolved(true)}>
                Show {hiddenCleared} cleared
              </Button>
            ) : null}
          </Card>
        </div>
      ) : (
        <div className="mc-mistakes__panes">
          <div className="mc-mistakes__master">
            <div className="mc-mistakes__tabsrow">
              {tabList}
              {showClearedToggle ? (
                <Button variant="text" onClick={() => setShowResolved(!showResolved)}>
                  {showResolved ? 'Hide cleared' : `Show ${clearedCount} cleared`}
                </Button>
              ) : null}
            </div>

            <div
              role="tabpanel"
              id="mc-mistakes-panel"
              aria-labelledby={tabDomId(activeTab)}
              className="mc-mistakes__panel"
            >
              <h2 className="mc-visually-hidden">{panelHeading}</h2>
              <p className="mc-mistakes__caption">{TAB_CAPTION[activeTab]}</p>
              {activeRows.length === 0 ? (
                <p className="mc-mistakes__empty mc-fineprint">{EMPTY_COPY[activeTab]}</p>
              ) : (
                <ul role="listbox" aria-label={panelHeading} className="mc-mistakes__list">
                  {activeRows.map((row, i) => (
                    <li
                      key={row.id}
                      role="option"
                      id={rowDomId(row.id)}
                      aria-selected={selectedRow?.id === row.id}
                      tabIndex={selectedRow?.id === row.id ? 0 : -1}
                      ref={(el) => {
                        rowRefs.current[row.id] = el;
                      }}
                      className="mc-mrow"
                      onClick={() => openRow(row)}
                      onKeyDown={(e) => onRowKeyDown(e, i)}
                    >
                      <RowTag row={row} />
                      <span className="mc-mrow__title">{rowTitle(row)}</span>
                      <span className="mc-mrow__meta">
                        {rowMeta(row)}
                        <IconChevron className="mc-mrow__chev" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div
            className="mc-mistakes__detail"
            role="region"
            aria-label="Mistake detail"
            tabIndex={-1}
            ref={detailRef}
          >
            <Button className="mc-mistakes__back" variant="text" onClick={() => setDetailOpen(false)}>
              ← Back to list
            </Button>
            {selectedRow === null ? (
              <Card elevated>
                <p className="mc-muted">{EMPTY_COPY[activeTab]}</p>
              </Card>
            ) : (
              <Card elevated className="mc-mistakes__detailcard">
                {selectedRow.kind === 'miss' ? (
                  <ErrorRow
                    entry={selectedRow.entry}
                    position={selectedIndex + 1}
                    total={activeRows.length}
                    onTryAgain={tryAgain}
                  />
                ) : selectedRow.kind === 'pattern' ? (
                  <PatternRow pattern={selectedRow.pattern} onTryAgain={tryAgain} />
                ) : selectedRow.kind === 'cars' ? (
                  <CarsReasoningRow pattern={selectedRow.pattern} onTryAgain={tryAgain} />
                ) : (
                  <ShakyWinRow
                    entry={selectedRow.entry}
                    position={selectedIndex + 1}
                    total={activeRows.length}
                    onTryAgain={tryAgain}
                  />
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One-line title for a master-list row (CSS truncates it). */
function rowTitle(row: Row): string {
  switch (row.kind) {
    case 'miss':
    case 'win':
      return row.entry.stem;
    case 'pattern':
      return row.pattern.label;
    case 'cars':
      return row.pattern.title;
  }
}

/** The small right-aligned meta for a master-list row: date, "X/Y", or hold%. */
function rowMeta(row: Row): string {
  switch (row.kind) {
    case 'miss':
    case 'win':
      return dateLabel(row.entry.occurredAt);
    case 'pattern':
      return `${row.pattern.missedItems}/${row.pattern.attemptedItems}`;
    case 'cars':
      return `${row.pattern.holdRatePct}%`;
  }
}

/**
 * The row's tag pill. It reads as a status/type at a glance: a confidently-wrong miss
 * is amber, a cleared item green, a pattern teal, a shaky win grey, a CARS repair
 * purple.
 */
function RowTag({ row }: { row: Row }) {
  if (row.kind === 'miss') {
    if (row.entry.resolved) return <span className="mc-pill mc-pill--ok mc-mrow__tag">Cleared</span>;
    if (row.entry.calibration === 'confidently_wrong')
      return <span className="mc-pill mc-pill--warn mc-mrow__tag">Confidently wrong</span>;
    return <span className="mc-pill mc-mrow__tag">Miss</span>;
  }
  if (row.kind === 'pattern')
    return <span className="mc-pill mc-pill--pattern mc-mrow__tag">Pattern</span>;
  if (row.kind === 'win') return <span className="mc-pill mc-mrow__tag">Shaky win</span>;
  if (row.pattern.resolved) return <span className="mc-pill mc-pill--ok mc-mrow__tag">Cleared</span>;
  return <span className="mc-pill mc-pill--cars mc-mrow__tag">CARS</span>;
}

/** The position suffix (" · N of M"), shown only when there is more than one row. */
const positionSuffix = (position: number, total: number): string =>
  total > 1 ? ` · ${position} of ${total}` : '';

/**
 * The focused card for a miss. It re-shows what the learner already saw: the stem, the
 * option they picked, the key, the refutation shown at the time, and the misconception
 * behind the picked distractor. Answer material is authorized because the learner
 * already answered — this is a re-show, not a new reveal.
 */
function ErrorRow({
  entry,
  position,
  total,
  onTryAgain,
}: {
  entry: ErrorEntryView;
  position: number;
  total: number;
  onTryAgain: (focus: string | null) => void;
}) {
  const confidentlyWrong = entry.calibration === 'confidently_wrong';
  return (
    <div className="mc-mdetail">
      <div className="mc-mdetail__head">
        <Eyebrow>
          {confidentlyWrong ? 'Confidently wrong' : 'Miss'} · {dateLabel(entry.occurredAt)}
          {positionSuffix(position, total)}
        </Eyebrow>
        {entry.resolved ? <span className="mc-pill mc-pill--ok">Cleared</span> : null}
      </div>
      <p className="mc-mdetail__stem">{entry.stem}</p>
      <div className="mc-mdetail__answers">
        <p className="mc-answerline mc-answerline--wrong">
          <IconCircleX className="mc-answerline__icon" />
          <span>
            <span className="mc-answerline__lead">You picked </span>
            {entry.chosenChoiceId ?? '—'}
            {entry.chosenChoiceText ? ` · ${entry.chosenChoiceText}` : ''}
          </span>
        </p>
        <p className="mc-answerline mc-answerline--right">
          <IconCircleCheck className="mc-answerline__icon" />
          <span>
            <span className="mc-answerline__lead">Correct </span>
            {entry.correctChoiceId}
            {entry.correctChoiceText ? ` · ${entry.correctChoiceText}` : ''}
          </span>
        </p>
      </div>
      {entry.chosenMisconception !== null ? (
        <p className="mc-mdetail__trap">
          <IconTrap className="mc-mdetail__trapicon" />
          <span className="mc-mdetail__trapbody">
            <span className="mc-muted">The trap: </span>
            <span className="mc-mdetail__traptext">{entry.chosenMisconception}</span>
          </span>
        </p>
      ) : null}
      {entry.choiceRationale !== null ? (
        <Callout tone="info" title={`Why ${entry.chosenChoiceId ?? 'that'} misses`}>
          {entry.choiceRationale}
        </Callout>
      ) : null}
      {/* Re-express the refutation the learner already saw — grounded, no new facts. */}
      {entry.choiceRationale !== null ? (
        <ExplainAnotherWay
          questionId={entry.questionId}
          source={{ rationale: entry.choiceRationale }}
          gate={{ skill: entry.skillId, section: sectionForCluster(entry.cluster), dok: null }}
        />
      ) : null}
      <div className="mc-mdetail__actions">
        <Button variant="primary" onClick={() => onTryAgain(entry.focus)}>
          Try a fresh one
        </Button>
      </div>
    </div>
  );
}

/**
 * The focused card for a pattern. The denominator is never optional: "3 of 7 questions"
 * is a claim a learner can check, "3 mistakes" is not. Below the assertion floor the
 * copy hedges instead of naming a weakness — Ellerton & Clements found the careless
 * share of errors on a single item ranged from 1% to 71%, so a small-sample "pattern"
 * is most likely an artifact of which items came up. The leaned-toward misconception is
 * named only once the pattern is assertable, for the same reason.
 */
function PatternRow({
  pattern,
  onTryAgain,
}: {
  pattern: MistakePatternView;
  onTryAgain: (focus: string | null) => void;
}) {
  return (
    <div className="mc-mdetail">
      <Eyebrow>{pattern.grain === 'kc' ? 'Knowledge component' : 'Cluster'}</Eyebrow>
      <p className="mc-mdetail__stem">{pattern.label}</p>
      <p className="mc-muted mc-fineprint">
        {pattern.missedItems} of {pattern.attemptedItems} question
        {pattern.attemptedItems === 1 ? '' : 's'} missed here
        {pattern.assertable
          ? ' — enough to call this a weak spot.'
          : ' — too few so far to call it a pattern.'}
      </p>
      {pattern.leaningMisconception !== null ? (
        <p className="mc-fineprint">
          <span className="mc-muted">Most often: </span>
          {pattern.leaningMisconception}
        </p>
      ) : null}
      <div className="mc-mdetail__actions">
        <Button variant="primary" onClick={() => onTryAgain(pattern.focus)}>
          Practice this
        </Button>
      </div>
    </div>
  );
}

/**
 * The focused card for a CARS reasoning-pattern repair (WS7). Unlike a KC/cluster
 * pattern it carries no "X of Y missed" denominator — a duel is a formative debate — so
 * the honest signal is the duel hold-rate, and the action is a specific real CARS
 * passage in the flagged sub-skill. "Practice this passage" routes into the same
 * adaptive queue with a CARS sub-skill focus, so the queue's exposure seam serves a
 * fresh passage in that skill; answering one correctly is what clears the card.
 */
function CarsReasoningRow({
  pattern,
  onTryAgain,
}: {
  pattern: CarsReasoningPatternView;
  onTryAgain: (focus: string | null) => void;
}) {
  return (
    <div className="mc-mdetail">
      <div className="mc-mdetail__head">
        <Eyebrow>CARS reasoning · {pattern.skill}</Eyebrow>
        {pattern.resolved ? <span className="mc-pill mc-pill--ok">Cleared</span> : null}
      </div>
      <p className="mc-mdetail__stem">{pattern.title}</p>
      <p className="mc-muted mc-fineprint">
        A recent CARS Duel held at {pattern.holdRatePct}% here — below the ~75% mark, so this skill
        is worth a focused rep.
      </p>
      {pattern.passageStem !== null ? (
        <Callout tone="info" title="Practice passage">
          {pattern.passageStem}
        </Callout>
      ) : null}
      <div className="mc-mdetail__actions">
        <Button variant="primary" onClick={() => onTryAgain(pattern.focus)}>
          Practice this passage
        </Button>
      </div>
    </div>
  );
}

/**
 * The focused card for a shaky win: a correct first attempt the calibration read
 * flagged as slow or in a still-weak KC. There is no refutation to show (the pick was
 * the key) and no misconception — the card's job is to route a fresh rep in the same
 * area to convert a shaky win into a solid one.
 */
function ShakyWinRow({
  entry,
  position,
  total,
  onTryAgain,
}: {
  entry: ErrorEntryView;
  position: number;
  total: number;
  onTryAgain: (focus: string | null) => void;
}) {
  return (
    <div className="mc-mdetail">
      <div className="mc-mdetail__head">
        <Eyebrow>
          Shaky win · {dateLabel(entry.occurredAt)}
          {positionSuffix(position, total)}
        </Eyebrow>
        <span className="mc-pill">Shaky win</span>
      </div>
      <p className="mc-mdetail__stem">{entry.stem}</p>
      <p className="mc-fineprint">
        <span className="mc-muted">You answered </span>
        {entry.correctChoiceId}
        {entry.correctChoiceText ? ` · ${entry.correctChoiceText}` : ''}
        <span className="mc-muted"> — correct.</span>
      </p>
      <div className="mc-mdetail__actions">
        <Button variant="primary" onClick={() => onTryAgain(entry.focus)}>
          Try a fresh one
        </Button>
      </div>
    </div>
  );
}
