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
# Never `npx biome` here: `@biomejs/biome` is a *scoped* package, so once the workspace's own
# node_modules/.bin/biome shim is gone for any reason (a broken install, a platform-mismatched
# node_modules mounted from the wrong OS — the exact failure class `.husky/pre-commit`'s own
# comment already documents for this repo), bare `npx biome` does not error: npx falls through to
# silently fetching and running an unrelated package that also happens to be published under the
# unscoped name "biome", and this step passes with exit 0 having linted nothing. Confirmed by
# hiding the binary and observing the fallback install in this container, 2026-09-09. `pnpm run
# lint` (this package's own `lint` script) resolves the same way `pnpm run check` always has —
# node_modules/.bin on PATH, a plain shell "command not found" if it is ever absent again — which
# is what actually fails loud instead of reading as green.
pnpm run lint >/dev/null

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
