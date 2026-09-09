#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# The nightly benchmark/allocation-regression entry point: runs the suite, saves a dated
# snapshot, then gates it against last time's snapshot via `tools/bench-gate.ts`
# (threshold + machine-readable verdict — `vitest bench --compare` alone never fails the build,
# it only prints a table). Exact command for the nightly script to call:
#   pnpm run bench:save
# Runs from the repo root (this script `cd`s into packages/benchmarks itself); exit code is the
# gate's — 0 pass/no-baseline-yet, 1 a real regression. `latest.json` always advances to this
# run's snapshot, pass or fail, so a failing night doesn't wedge every future comparison against
# a stale baseline — the gate compares each run only to the immediately preceding one, catching a
# single commit's regression rather than slow multi-night drift (a deliberate, documented choice,
# not an oversight).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$REPO_ROOT/reports/benchmarks"
mkdir -p "$REPORT_DIR"

SHORT_HASH=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
DATE=$(date +%Y-%m-%d)
# Time-of-day, not just date+hash: two runs against the same commit on the same day (a re-run
# while debugging, or a quiet night with no new commit) would otherwise share a filename — the
# second run's `--outputJson` would silently overwrite the first's snapshot, and the gate would
# then compare that file against itself (guaranteed 0% delta, not a real "still stable" result).
# Found exactly this while testing this script — not a hypothetical.
FILENAME="$DATE-$SHORT_HASH-$(date +%H%M%S).json"
OUTPUT="$REPORT_DIR/$FILENAME"
LATEST="$REPORT_DIR/latest.json"
GATE_RESULT="$REPORT_DIR/gate-result.json"

echo "Running benchmarks..."
cd "$REPO_ROOT/packages/benchmarks"
npx vitest bench --outputJson "$OUTPUT"

cd "$REPO_ROOT"
GATE_STATUS=0
npx tsx tools/bench-gate.ts --current "$OUTPUT" --baseline "$LATEST" --out "$GATE_RESULT" || GATE_STATUS=$?

# Advance the baseline regardless of verdict — see header comment for why.
ln -sf "$FILENAME" "$LATEST"

echo ""
echo "Saved: reports/benchmarks/$FILENAME"
echo "Gate result: reports/benchmarks/gate-result.json"
exit "$GATE_STATUS"
