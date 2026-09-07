#!/usr/bin/env sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# Dependency-vulnerability scan against the OSV database. Network-dependent
# both to install and to query, so this only ever runs on CI's schedule/web
# job (never per commit — THIN-CI ruling). Self-installs the latest release
# from GitHub when absent, since that job already pays for network on every
# run; locally (no $CI) a failed download warns and passes instead.
set -eu
cd "$(dirname "$0")/.."
CACHED=.tools-cache/osv-scanner/osv-scanner

resolve_bin() {
	if command -v osv-scanner >/dev/null 2>&1; then
		echo osv-scanner
	elif [ -x "$CACHED" ]; then
		echo "$CACHED"
	fi
}

BIN=$(resolve_bin)

if [ -z "$BIN" ]; then
	mkdir -p .tools-cache/osv-scanner
	ARCH=$(uname -m)
	[ "$ARCH" = x86_64 ] && ARCH=amd64
	[ "$ARCH" = aarch64 ] && ARCH=arm64
	URL=$(curl -fsSL https://api.github.com/repos/google/osv-scanner/releases/latest 2>/dev/null |
		grep -o "https://[^\"]*linux_${ARCH}\"" | tr -d '"' | head -1 || true)
	if [ -n "$URL" ] && curl -fsSL -o "$CACHED" "$URL" 2>/dev/null; then
		chmod +x "$CACHED"
		BIN="$CACHED"
	fi
fi

if [ -z "$BIN" ]; then
	if [ -n "${CI:-}" ]; then
		echo "osv-scanner: could not install in CI — failing the gate rather than skipping it silently." >&2
		exit 1
	fi
	echo "osv-scanner not installed — dependency scan skipped locally. CI installs it." >&2
	exit 0
fi

"$BIN" scan source --recursive .
