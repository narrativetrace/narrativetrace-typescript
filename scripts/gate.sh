#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
#
# `pnpm run check`, invoked as a single command — kept only because `check:container` and the
# GitHub Actions jobs name this path.
#
# Rule-5 shape (derive, never copy): this used to re-run `check`'s steps one at a time as a
# hand-kept list, for per-step headings and quiet output. That list silently drifted — a
# 2026-09-18 finding found 10 of `check`'s steps missing here, including `legal-check` and
# `duplication:check` — because every step `check` grew afterward had to be remembered and copied
# into a second place by hand, and nothing enforced that it ever was. `tools/__tests__/gate-
# shape.test.ts` now asserts this file never goes back to re-enumerating `check`'s steps.
#
# The per-step headings and quiet output are gone with it: there is now exactly one command that
# can diverge from `check`, and that command is `check` itself. `NT_MUTATION_WORKERS`, if set,
# passes through normally — this script sets no concurrency of its own.
set -euo pipefail
cd "$(dirname "$0")/.."

exec pnpm run check
