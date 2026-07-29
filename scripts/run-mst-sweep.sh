#!/usr/bin/env bash
#
# Run one MST delivery study in parallel and print the merged table.
#
#   MST_SWEEP=attribution scripts/run-mst-sweep.sh
#   MST_SWEEP=granularity MST_N=250 SHARDS=8 scripts/run-mst-sweep.sh
#   MST_SWEEP=quantiles   scripts/run-mst-sweep.sh
#
# Cells are independent (same seeds, no shared state), so sharding is
# result-identical to a serial run.
#
set -euo pipefail

cd "$(dirname "$0")/.."

MST_SWEEP="${MST_SWEEP:-attribution}"
MST_N="${MST_N:-250}"
MST_LEN="${MST_LEN:-140}"
# `hard` restricts the grid to the corner every arm fails in, so it can be run
# deep enough that the worst-world column stops being noise.
MST_WORLDS="${MST_WORLDS:-all}"
SHARDS="${SHARDS:-8}"
OUT="${OUT:-.tmp/mst-$MST_SWEEP-$MST_WORLDS}"
PNPM="npx --yes pnpm@9.15.9"
VITEST="$PNPM --filter @mcat/policies exec vitest run diagnostic-mst-sweep --reporter=basic"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "MST study '$MST_SWEEP' at $MST_LEN items, $MST_N learners per cell across $SHARDS shards..."
START=$(date +%s)

for ((k = 0; k < SHARDS; k++)); do
  MST_SWEEP="$MST_SWEEP" MST_N="$MST_N" MST_LEN="$MST_LEN" MST_WORLDS="$MST_WORLDS" \
    MST_SHARD="$k/$SHARDS" MST_OUT="$OUT" \
    $VITEST >"$OUT/shard-$k.log" 2>&1 &
done

for job in $(jobs -p); do
  wait "$job" || true
done

# A shard's exit code is not a usable signal here. A single deep cell is a
# minute of synchronous work, which Vitest's worker heartbeat reports as an
# unhandled "Timeout calling onTaskUpdate" and turns into a non-zero exit long
# after the cells themselves have been computed and written. What matters is
# whether every shard produced its results file.
MISSING=0
for ((k = 0; k < SHARDS; k++)); do
  [[ -f "$OUT/$k-of-$SHARDS.json" ]] || { echo "shard $k wrote no results" >&2; MISSING=1; }
done
if [[ $MISSING -ne 0 ]]; then
  echo "Logs: $OUT/shard-*.log" >&2
  exit 1
fi

echo "Shards finished in $(($(date +%s) - START))s. Merging..."
MST_SWEEP="$MST_SWEEP" MST_N="$MST_N" MST_LEN="$MST_LEN" MST_WORLDS="$MST_WORLDS" \
  MST_MERGE="$OUT" $VITEST
