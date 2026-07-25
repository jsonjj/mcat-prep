import type { DraftEntryCheck, DraftPreviewRoute } from './contract';

/**
 * LOCAL DRAFT PREVIEW ONLY
 *
 * This tiny simulation exists so authors can inspect three possible lesson
 * lengths. It is not imported from, aligned to, or authoritative for any
 * production planner. Its outputs are not placement, mastery, or evidence.
 */
export const DRAFT_PREVIEW_ROUTING_DISCLAIMER =
  'This local route only changes the draft preview. It is not planner logic or mastery evidence.';

export function simulateDraftPreviewRoute(
  entryChecks: readonly DraftEntryCheck[],
  selectedOptionByCheckId: Readonly<Record<string, string | undefined>>,
): DraftPreviewRoute {
  const signals = entryChecks.flatMap((check) => {
    const selectedOptionId = selectedOptionByCheckId[check.id];
    const signal =
      selectedOptionId === undefined
        ? undefined
        : check.evaluation.previewRouteSignalByOption[selectedOptionId];
    return signal === undefined ? [] : [signal];
  });

  if (signals.length !== entryChecks.length) return 'standard';
  if (signals.every((signal) => signal === 'concise')) return 'concise';

  const supportSignals = signals.filter((signal) => signal === 'support').length;
  if (supportSignals >= Math.ceil(signals.length / 2)) return 'support';

  return 'standard';
}
