#!/usr/bin/env sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# SAST scan — OSS community registry rulesets only (owner ruling: no custom
# rules; tooling-public/findings-private). CI entry point: MR + scheduled,
# never per push (same cadence tier as the `mutation` job, quality-tooling-
# parity.md's convention) — Semgrep fetches rule packs from its registry on
# every run, which is exactly the network dependency THIN-CI keeps out of
# the per-commit gate.
#
# Self-bootstraps into an isolated venv when semgrep isn't already
# installed (this container's Python is externally managed — no system
# pip), since the CI job already pays for network. Locally (no $CI) a
# failed bootstrap warns and passes instead of blocking.
set -eu
cd "$(dirname "$0")/.."
CACHE=.tools-cache/semgrep-venv
CACHED="$CACHE/bin/semgrep"

resolve_bin() {
	if command -v semgrep >/dev/null 2>&1; then
		echo semgrep
	elif [ -x "$CACHED" ]; then
		echo "$CACHED"
	fi
}

BIN=$(resolve_bin)

if [ -z "$BIN" ]; then
	if python3 -m venv --without-pip "$CACHE" 2>/dev/null &&
		curl -fsSL https://bootstrap.pypa.io/get-pip.py 2>/dev/null | "$CACHE/bin/python3" - --quiet 2>/dev/null &&
		"$CACHE/bin/pip" install --quiet semgrep 2>/dev/null; then
		BIN="$CACHED"
	else
		rm -rf "$CACHE"
	fi
fi

if [ -z "$BIN" ]; then
	if [ -n "${CI:-}" ]; then
		echo "semgrep: could not install in CI — failing the gate rather than skipping it silently." >&2
		exit 1
	fi
	echo "semgrep not installed and could not be bootstrapped (offline, or no python3?) — SAST scan skipped locally. CI installs it." >&2
	exit 0
fi

"$BIN" --config p/security-audit --config p/typescript --config p/javascript \
	--config p/owasp-top-ten --metrics=off --error .
