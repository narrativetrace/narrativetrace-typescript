#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
#
# scripts/settle-markers.sh <version>
#
# Post-release marker settle — run once, in-tree, right after the release-snapshot script's
# `--tag` mode has actually published <version> to the registry.
#
# `--tag` rewrites shipped "*(since X, unreleased)*" markers to drop the qualifier in the STAGED
# SNAPSHOT ONLY (docs-vs-published-gate design, decision 1) — never in-tree, same "stamped only at
# publish time" discipline as the license header. Once X is actually on the registry, the PRIVATE
# tree still carries the unreleased form for it, so the next UNTAGGED snapshot would ship
# "unreleased" prose for a version that has already shipped — and the *next* `--tag` run's own
# stale-marker gate (which flags every marker whose version is <= the version being tagged) would
# then fail on X's own leftover markers. This script applies the same mechanical rewrite once,
# in-tree — mechanical, never editorial: it only ever drops ", unreleased" from a marker citing
# EXACTLY <version>, over the same universe of files that actually reach a staged public snapshot
# (tools/settle-since-markers.ts's settleScopeFiles — see that module's header for exactly which
# of documentation/**, the root README + its translated mirrors, and each package's own README are
# and are not included, and why).
#
# Refuses (exit 1, nothing written) unless <version> is actually present on the registry — a
# settle must never run ahead of the publish, and an offline run refuses rather than guessing —
# and refuses again if it finds zero markers to settle (a stale version argument or a scope gap is
# a mistake, not a success). See tools/settle-since-markers-cli.ts for both checks.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
TSX="$REPO_ROOT/node_modules/.bin/tsx"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "usage: scripts/settle-markers.sh <version>" >&2
    exit 1
fi

[ -z "$(git status --porcelain)" ] || { echo "ERROR: working tree not clean."; exit 1; }

echo ">> Settling shipped 'since $VERSION, unreleased' markers in-tree ..."
"$TSX" "$REPO_ROOT/tools/settle-since-markers-cli.ts" "$REPO_ROOT" "$VERSION"

# settle-since-markers-cli.ts's own settleMarkers already refreshes llms.txt's "N behaviour(s)
# marked unreleased" banner count in-process, right after the marker rewrite (same "mechanical,
# deterministic" discipline as the release-snapshot script's own `--tag` banner refresh) — and,
# critically, restamps every translated mirror whose English source that refresh itself changed,
# not only mirrors of the marker-rewritten sources (the 2026-09-17 regression: a source with no
# marker of its own, mutated only by the banner/snippet regeneration, left its mirror stale). A
# second, separate refresh here would be redundant — settleMarkers already left the count correct.
