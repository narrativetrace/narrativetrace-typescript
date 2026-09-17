#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
#
# `pnpm run check`, run step by step with quiet output.
#
# WHY IT IS NOT JUST `pnpm run check`: only the per-step headings and the quiet
# output. It runs the same steps in the same order, and fails the same way.
#
# It no longer carries a concurrency of its own: the Turbo steps go through
# `tools/turbo-run.mjs`, which derives the package-level concurrency from the
# machine's CPU budget (`NT_MUTATION_WORKERS`, else the cgroup v2 CPU quota,
# else the runtime CPU count) and gives each package one test worker. That is
# the same number `pnpm run check` uses, so this script can no longer survive a
# load `check` does not — which is what a hand-picked `GATE_CONCURRENCY=2` here
# had been quietly papering over. Override the budget with
# `NT_MUTATION_WORKERS`, never with a second number in a second script.
set -euo pipefail
cd "$(dirname "$0")/.."

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
node tools/turbo-run.mjs build 2>&1 | grep -E "turbo-run|Tasks:|ERROR|error" || true
node tools/turbo-run.mjs build >/dev/null

step "metrics (20-line gate)"
npx tsx tools/metrics.ts | tail -3

step "doc coverage"
pnpm run doc-coverage | tail -2

step "clarity gate"
pnpm run clarity:gate >/dev/null

step "translation check"
pnpm run translation-check

step "root tests"
node tools/tree-writes-guard.mjs pnpm run test:root 2>&1 | grep -E "Test Files|Tests |tree-writes-guard" | tail -2

step "package tests + coverage"
node tools/tree-writes-guard.mjs pnpm run coverage 2>&1 | grep -E "turbo-run|Tasks:|Failed:|tree-writes-guard" | tail -3

step "snippet check"
pnpm run snippet-check

printf '\nGATE GREEN\n'
