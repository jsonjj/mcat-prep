import { PassageOfDayService } from '@mcat/passage-of-day';
import { passagePoolSourceLine, resolvePassagePool } from './passage-pool-source';

/**
 * Passage of the Day — the dev/preview server's binding of the shared, pure
 * selection/scoring service (`@mcat/passage-of-day`) to a concrete pool.
 *
 * The service and its types are re-exported so existing import sites (the API
 * handler, the tests) keep resolving them here; the only thing this module adds
 * is the process-wide singleton built from the DB-first async loader.
 *
 * Node-only: the pool the loader resolves carries answer keys and per-choice
 * rationales, so like the diagnostic and practice banks this runs solely inside
 * the dev/preview server (loaded via `ssrLoadModule`) and never enters the
 * browser bundle.
 */
export * from '@mcat/passage-of-day';

let servicePromise: Promise<PassageOfDayService> | undefined;

/**
 * The process-wide passage service, built once from the DB-first async loader
 * (postgres → local store → hardcoded pool) and memoized. Every request handler
 * awaits this. A failed build is NOT cached, so a transient DB error can be
 * retried on the next request rather than wedging the feature for the process.
 */
export function getPassageOfDayService(): Promise<PassageOfDayService> {
  if (servicePromise === undefined) {
    servicePromise = resolvePassagePool()
      .then((result) => {
        console.info(passagePoolSourceLine(result));
        return new PassageOfDayService(result.entries);
      })
      .catch((error: unknown) => {
        servicePromise = undefined;
        throw error;
      });
  }
  return servicePromise;
}
