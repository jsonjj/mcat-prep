/**
 * Per-bucket diagnostic readout: how likely each bucket is to need work, and
 * how firmly that estimate is pinned down.
 *
 * Gap and certainty are carried by two different marks, not two colours: the
 * solid bar is the point estimate, and the hatched whisker above it is the
 * plausible range, which widens as certainty falls. A shaky high gap therefore
 * looks visibly different from a settled one in greyscale, and the whisker
 * width, the hatch texture and the wording all repeat the same signal.
 *
 * Certainty is the share of the prior's spread that the answers removed, so it
 * is lowest for buckets sitting near the line between needing work and not —
 * not for the buckets we asked least about. Nothing here may imply that a low
 * read means too few questions; the item count and `stillConfirming` carry the
 * sample-size story separately.
 *
 * The chart draws every sampled bucket. The reported starting points are marked
 * within it — in words as well as in colour — rather than shown instead of it.
 */

export interface BucketGapRow {
  bucketId: string;
  title: string;
  /** 0..1, higher = more likely to need work. */
  gap: number;
  /** 0..1, how tightly the gap is pinned; lowest for borderline buckets. */
  certainty: number;
  itemsSeen: number;
}

/** Ordinal, low to high. These are style hooks; the learner-facing words are in `label`. */
export type CertaintyBandId = 'provisional' | 'moderate' | 'confident';

export interface CertaintyBand {
  id: CertaintyBandId;
  label: string;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Descending by gap; ties broken by the more firmly pinned row, then by title. */
export function sortBucketRows(rows: readonly BucketGapRow[]): BucketGapRow[] {
  return [...rows].sort(
    (a, b) =>
      clamp01(b.gap) - clamp01(a.gap) ||
      clamp01(b.certainty) - clamp01(a.certainty) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Cut points are the 3rd and 7th deciles of the certainty distribution the
 * *served* form produces, carried at the precision they were measured to rather
 * than rounded to something tidier.
 *
 * Which form matters more than it looks. Certainty is the share of the prior's
 * spread the answers removed, so it moves with how items were delivered, not
 * only with how many. Measured on the design `productionDesign()` resolves to —
 * `MST_140_RECOMMENDED`, seven 20-item blocks with contention-allocated slots —
 * over the ten Foundational Concepts, it spans 0.375..0.999 with a median of
 * 0.882 across 240,000 concept reads: the 24-world assumption grid at 1,000
 * learners a world, seed 20260725. `server/certainty-bands.test.ts` re-runs it.
 *
 * The 0.719/0.89 pair these replace were deciles of a population spanning
 * 0.450..0.993 with median 0.804, which the served form does not produce. Cut
 * against what it does produce, 0.89 sits barely above the median and sorts
 * reads 13/39/48 — most of a cohort in the top band, which is the saturation
 * the decile cut was adopted to remove. Re-derive whenever the served design
 * moves: block structure, allocation rule, form length and concept count each
 * shift the distribution, and nothing else in the app notices when they have.
 */
const SETTLED_CERTAINTY = 0.9527;
const MOSTLY_SETTLED_CERTAINTY = 0.7914;

/**
 * Wording describes how settled the reading is, never how much was asked. A low
 * certainty means the bucket's gap sits close to the weakness line, and a
 * learner who got half the items right reads lower than one who got none right;
 * "we need more questions here" would be the wrong story to tell about it.
 */
export function certaintyBand(certainty: number): CertaintyBand {
  const c = clamp01(certainty);
  if (c >= SETTLED_CERTAINTY) return { id: 'confident', label: 'Settled read' };
  if (c >= MOSTLY_SETTLED_CERTAINTY) return { id: 'moderate', label: 'Mostly settled' };
  return { id: 'provisional', label: 'Borderline read' };
}

/**
 * Plausible range around the point estimate. Half-widths run from 0.313 at the
 * least settled read the served form has produced down to 0.0005 at the most
 * settled, so the whisker is always drawn; the track's `min-width` keeps the
 * tightest one from disappearing.
 */
export function gapRange(gap: number, certainty: number): { lo: number; hi: number } {
  const point = clamp01(gap);
  const halfWidth = (1 - clamp01(certainty)) * 0.5;
  return { lo: clamp01(point - halfWidth), hi: clamp01(point + halfWidth) };
}

export interface BucketRowView {
  row: BucketGapRow;
  /** One of the areas the results screen lists as a starting point. */
  isPriority: boolean;
}

/**
 * Every row, in display order, tagged with whether it is a reported starting
 * point. Marking is additive on purpose: the priority list is narrower than the
 * measurement, so a bucket that missed the list still has to be drawn.
 */
export function bucketRowViews(
  rows: readonly BucketGapRow[],
  priorityIds: readonly string[] = [],
): BucketRowView[] {
  const priorities = new Set(priorityIds);
  return sortBucketRows(rows).map((row) => ({ row, isPriority: priorities.has(row.bucketId) }));
}

export function bucketRowLabel(row: BucketGapRow): string {
  const { lo, hi } = gapRange(row.gap, row.certainty);
  const pct = (n: number): number => Math.round(n * 100);
  const items = row.itemsSeen === 1 ? '1 question' : `${row.itemsSeen} questions`;
  // The band and the item count are separate sentences: the old "<band>, based
  // on N questions" read as though the band were derived from the count.
  return `${row.title}: likely gap ${pct(row.gap)} percent, plausible range ${pct(lo)} to ${pct(
    hi,
  )} percent. ${certaintyBand(row.certainty).label}. ${items} seen.`;
}

/** The mark a starting-point row carries, in text as well as in colour. */
export const PRIORITY_MARK = 'Start here';

export function BucketGapChart({
  rows,
  priorityIds = [],
}: {
  rows: readonly BucketGapRow[];
  priorityIds?: readonly string[];
}) {
  if (rows.length === 0) {
    return <p className="mc-muted mc-fineprint">No areas have been sampled yet.</p>;
  }

  const views = bucketRowViews(rows, priorityIds);
  const marked = views.some((view) => view.isPriority);

  return (
    <div className="mc-gapchart">
      <ol className="mc-gapchart__rows">
        {views.map(({ row, isPriority }) => {
          const gap = clamp01(row.gap);
          const band = certaintyBand(row.certainty);
          const { lo, hi } = gapRange(row.gap, row.certainty);

          return (
            <li
              key={row.bucketId}
              className={`mc-gapchart__row${isPriority ? ' mc-gapchart__row--priority' : ''}`}
            >
              <div className="mc-gapchart__head">
                <span className="mc-gapchart__label">
                  <span className="mc-gapchart__title">{row.title}</span>
                  {isPriority ? <span className="mc-gapchart__mark">{PRIORITY_MARK}</span> : null}
                </span>
                <span className="mc-gapchart__pct">{Math.round(gap * 100)}%</span>
              </div>

              <div
                className={`mc-gapchart__track mc-gapchart__track--${band.id}`}
                role="img"
                aria-label={bucketRowLabel(row)}
              >
                <span
                  className="mc-gapchart__range"
                  style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
                />
                <span className="mc-gapchart__fill" style={{ width: `${gap * 100}%` }} />
              </div>

              <p className="mc-gapchart__meta mc-fineprint" aria-hidden="true">
                <span className={`mc-gapchart__band mc-gapchart__band--${band.id}`}>
                  {band.label}
                </span>
                <span className="mc-muted">
                  {row.itemsSeen} {row.itemsSeen === 1 ? 'question' : 'questions'} seen
                </span>
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mc-gapchart__axis mc-fineprint mc-muted" aria-hidden="true">
        Bar = likely gap. Hatched whisker = how far the real answer could sit either side; it is
        widest where an area sits closest to the line between needing work and not.
        {marked ? ' Marked rows are the ones we suggest starting with.' : ''}
      </p>
    </div>
  );
}
