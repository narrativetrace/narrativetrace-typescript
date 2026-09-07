#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_DIR="$REPO_ROOT/reports/benchmarks"
mkdir -p "$REPORT_DIR"

SHORT_HASH=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
DATE=$(date +%Y-%m-%d)
FILENAME="$DATE-$SHORT_HASH.json"
OUTPUT="$REPORT_DIR/$FILENAME"

LATEST="$REPORT_DIR/latest.json"

COMPARE_FLAG=""
if [ -f "$LATEST" ]; then
  COMPARE_FLAG="--compare $LATEST"
fi

echo "Running benchmarks..."
cd "$REPO_ROOT/packages/benchmarks"
# shellcheck disable=SC2086
npx vitest bench --outputJson "$OUTPUT" $COMPARE_FLAG

# Update latest symlink
ln -sf "$FILENAME" "$LATEST"

echo ""
echo "Saved: reports/benchmarks/$FILENAME"
