#!/usr/bin/env bash
#
# Run the diagnostic assumption sweep in parallel and print the merged report.
#
#   scripts/run-diagnostic-sweep.sh              # 250 learners/cell, 8 shards
#   SWEEP_N=500 SHARDS=12 scripts/run-diagnostic-sweep.sh
#
# Cells are independent (same seeds, no shared state), so sharding is
# result-identical to a serial run — verified at SWEEP_N=25.
#
set -euo pipefail

cd "$(dirname "$0")/.."

SWEEP_N="${SWEEP_N:-250}"
SHARDS="${SHARDS:-8}"
OUT="${OUT:-.tmp/sweep}"
PNPM="npx --yes pnpm@9.15.9"
VITEST="$PNPM --filter @mcat/policies exec vitest run diagnostic-sweep --reporter=basic"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "Sweeping with $SWEEP_N learners per cell across $SHARDS shards..."
START=$(date +%s)

for ((k = 0; k < SHARDS; k++)); do
  SIM_SWEEP=1 SWEEP_N="$SWEEP_N" SWEEP_SHARD="$k/$SHARDS" SWEEP_OUT="$OUT" \
    $VITEST >"$OUT/shard-$k.log" 2>&1 &
done

# Report which shard failed rather than dying with a bare exit code.
FAILED=0
for job in $(jobs -p); do
  wait "$job" || FAILED=1
done
if [[ $FAILED -ne 0 ]]; then
  echo "At least one shard failed. Logs: $OUT/shard-*.log" >&2
  exit 1
fi

echo "Shards finished in $(($(date +%s) - START))s. Merging..."
SIM_SWEEP=1 SWEEP_MERGE="$OUT" $VITEST
