#!/usr/bin/env sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# Secrets scanner wrapper.
#
# "staged" — the pre-commit hook's own step, staged diff only. Never touches
# the network (THIN-CI ruling: nothing network-dependent in a per-commit
# gate): if gitleaks isn't already installed, this warns and passes, the
# same convention as the hook's license-header/lint-staged steps.
#
# "full" — git-history sweep, CI's MR/scheduled job (never per commit).
# Self-installs the latest release from GitHub when
# absent, since that job already pays for network on every run. Locally
# (no $CI) a failed download still warns and passes; in CI a failed
# download or scan fails the job — a silent skip there would defeat the
# point of the gate.
set -eu
cd "$(dirname "$0")/.."
MODE="${1:?usage: gitleaks.sh staged|full}"
CACHED=.tools-cache/gitleaks/gitleaks

resolve_bin() {
	if command -v gitleaks >/dev/null 2>&1; then
		echo gitleaks
	elif [ -x "$CACHED" ]; then
		echo "$CACHED"
	fi
}

BIN=$(resolve_bin)

if [ -z "$BIN" ] && [ "$MODE" = full ]; then
	mkdir -p .tools-cache/gitleaks
	ARCH=$(uname -m)
	[ "$ARCH" = x86_64 ] && ARCH=x64
	[ "$ARCH" = aarch64 ] && ARCH=arm64
	URL=$(curl -fsSL https://api.github.com/repos/gitleaks/gitleaks/releases/latest 2>/dev/null |
		grep -o "https://[^\"]*linux_${ARCH}\.tar\.gz" | head -1 || true)
	if [ -n "$URL" ] && curl -fsSL "$URL" 2>/dev/null | tar xz -C .tools-cache/gitleaks gitleaks 2>/dev/null; then
		chmod +x "$CACHED"
		BIN="$CACHED"
	fi
fi

if [ -z "$BIN" ]; then
	if [ -n "${CI:-}" ]; then
		echo "gitleaks: could not install in CI — failing the gate rather than skipping it silently." >&2
		exit 1
	fi
	echo "gitleaks not installed — secrets check ($MODE) skipped locally. CI installs it." >&2
	exit 0
fi

if [ "$MODE" = staged ]; then
	"$BIN" protect --staged --redact --config .gitleaks.toml
else
	"$BIN" detect --redact --config .gitleaks.toml
fi
