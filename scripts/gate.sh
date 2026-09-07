#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
#
# `pnpm run check`, run step by step with quiet output and coverage at a
# concurrency this container survives.
#
# WHY IT IS NOT JUST `pnpm run check`: at turbo's default concurrency (10) the
# core stress suite (`short-lived-contexts.stress.test.ts`) misses its 5 s
# budget on a loaded machine and the run goes red for a reason that is not a
# regression — it passes in 1.4 s on its own. Everything else is identical to
# the `check` script in package.json, in the same order, with the same failures.
set -euo pipefail
cd "$(dirname "$0")/.."

CONCURRENCY="${GATE_CONCURRENCY:-2}"

step() { printf '\n>> %s\n' "$1"; }

step "license headers"
npx tsx tools/license-header.ts --check

step "lint"
npx biome check . >/dev/null

step "build"
npx turbo run build --concurrency="$CONCURRENCY" 2>&1 | grep -E "Tasks:|ERROR|error" || true
npx turbo run build --concurrency="$CONCURRENCY" >/dev/null

step "metrics (20-line gate)"
npx tsx tools/metrics.ts | tail -3

step "doc coverage"
pnpm run doc-coverage | tail -2

step "clarity gate"
pnpm run clarity:gate >/dev/null

step "translation check"
pnpm run translation-check

step "root tests"
pnpm run test:root 2>&1 | grep -E "Test Files|Tests " | tail -2

step "package tests + coverage"
npx turbo run coverage --concurrency="$CONCURRENCY" 2>&1 | grep -E "Tasks:|Failed:" | tail -2

printf '\nGATE GREEN\n'
