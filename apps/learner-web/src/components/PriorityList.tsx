/**
 * The areas the diagnostic reports as starting points, and the copy that frames
 * them.
 *
 * Two, not three: at the production length a reported top three misses the
 * reproducibility bar on the worst assumption world while a top two clears it at
 * 88.0% (94.6% pooled), and most of what the third slot disagrees about is areas
 * whose true weakness differs by less than 0.10. The count is owned by
 * `REPORTED_PRIORITY_COUNT` in `@mcat/policies`; what lives here is the promise
 * the copy is allowed to make about it.
 *
 * That promise is deliberately small, and smaller than the headline figure
 * suggests: 88.0% is agreement on *one* of the two recurring, not on the pair.
 * Measured at 200 items, the identical two-area set reproduced only 47.8% of the
 * time and a single top area 60.8%; both criteria are far weaker than the one the
 * bar scores. So the copy claims no separation at all — not between the two, not
 * between them and the rest — and leans on the plan's continuous reordering
 * instead, which is what actually corrects a misread. The full per-area picture
 * is the chart below it.
 */

export interface PriorityEntry {
  cluster: string;
  title: string;
  tested: string;
}

export function priorityHeading(count: number): string {
  return count === 1 ? 'One place to start' : 'Two places to start';
}

export function priorityFraming(count: number): string {
  return count === 1
    ? 'Start here. Your plan keeps adjusting as you work, so nothing is locked in. The rest of the picture is below.'
    : 'Start with either one. Your plan keeps adjusting as you work, so nothing is locked in. The rest of the picture is below.';
}

export function PriorityList({ priorities }: { priorities: readonly PriorityEntry[] }) {
  return (
    <ul className="mc-diag-priorities">
      {priorities.map((priority) => (
        <li key={priority.cluster} className="mc-diag-priority">
          <span className="mc-diag-priority__body">
            <strong>{priority.title}</strong>
            <span className="mc-muted mc-fineprint">{priority.tested}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
