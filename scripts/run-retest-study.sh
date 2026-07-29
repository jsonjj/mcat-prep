#!/usr/bin/env bash
#
# Run the test-retest study in parallel and print the merged report.
#
#   scripts/run-retest-study.sh factors 200      # attribution + ceiling + remedies
#   scripts/run-retest-study.sh axes    140      # cluster-15 vs fc-10 vs fc-15
#
#   RETEST_N=250 SHARDS=8 scripts/run-retest-study.sh factors 200
#
# Cells are independent (same seeds, no shared state), so sharding is
# result-identical to a serial run.
#
set -euo pipefail

cd "$(dirname "$0")/.."

STUDY="${1:-factors}"
LEN="${2:-200}"
RETEST_N="${RETEST_N:-250}"
SHARDS="${SHARDS:-8}"
OUT="${OUT:-.tmp/retest-$STUDY-$LEN}"
PNPM="npx --yes pnpm@9.15.9"
VITEST="$PNPM --filter @mcat/policies exec vitest run diagnostic-retest --reporter=basic"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "Study '$STUDY' at $LEN items: $RETEST_N learners per cell across $SHARDS shards..."
START=$(date +%s)

for ((k = 0; k < SHARDS; k++)); do
  RETEST_STUDY="$STUDY" RETEST_LEN="$LEN" RETEST_N="$RETEST_N" \
    RETEST_SHARD="$k/$SHARDS" RETEST_OUT="$OUT" \
    $VITEST >"$OUT/shard-$k.log" 2>&1 &
done

FAILED=0
for job in $(jobs -p); do
  wait "$job" || FAILED=1
done
if [[ $FAILED -ne 0 ]]; then
  echo "At least one shard failed. Logs: $OUT/shard-*.log" >&2
  exit 1
fi

echo "Shards finished in $(($(date +%s) - START))s. Merging..."
RETEST_STUDY="$STUDY" RETEST_LEN="$LEN" RETEST_MERGE="$OUT" $VITEST
