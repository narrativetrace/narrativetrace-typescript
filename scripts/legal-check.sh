#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
#
# Verifies the legal:* marked regions in README.md and its root translations
# are well-formed, and — when the sibling repository holding the canonical
# legal text (legal.properties' legal.goldenRepo) is checked out next to this
# one — that those regions and LICENSE still match the canonical copies.
#
# The marker set is exactly {plain-words, trademark} — never `exclusion`:
# a marker line inside a GFM table row terminates the table, and the
# exclusion clause already lives verbatim inside the plain-words region, so
# a separate exclusion region would be both redundant and unsafe to place.
#
# (a) Marker well-formedness: every legal:* marker in README.md, LEAME.md,
#     LEIAME.md and 自述文件.md has exactly one begin/end pair, in order.
#     Runs unconditionally — no sibling required.
# (b) Golden comparison, only when $GOLDEN_REPO exists:
#       - LICENSE: golden LICENSE with its "Licensed Work:" line's work
#         description swapped for legal.licensedWork must byte-match this
#         repo's LICENSE exactly (placeholders included).
#       - each legal:* region: extracted from the matching-name golden file
#         (README.md <-> README.md, LEAME.md <-> LEAME.md, ...) and compared
#         to the local region with whitespace collapsed.
#       - of those regions, only `plain-words` is a true golden mirror (the
#         one text every runtime copies verbatim) and can fail the build.
#         `trademark` stays each runtime's own accurate sentence — this one has
#         a single LICENSE file where the Java runtime has two, so the wording
#         differs — its comparison is printed for review but never gates,
#         not even in strict mode.
# (c) A mismatch always prints a diff. Default mode WARNs and exits 0 (same
#     convention as translation-check: a checkout without the sibling stays
#     green). Set LEGAL_CHECK_STRICT=1 to fail instead on a LICENSE or
#     plain-words mismatch — the publish pipeline uses strict mode as a
#     preflight, because a publish must never ship drifted legal text.
#     Golden repo absent -> (b) is skipped with a note; (a) still runs and
#     can still fail in strict mode.
set -euo pipefail
cd "$(dirname "$0")/.."

PROPS="legal.properties"
[ -f "$PROPS" ] || { echo "ERROR: $PROPS not found at repo root."; exit 1; }

prop() {
    sed -n "s/^$1=\\(.*\\)\$/\\1/p" "$PROPS" | head -1
}

GOLDEN_REPO="$(prop legal.goldenRepo)"
LICENSED_WORK="$(prop legal.licensedWork)"
[ -n "$GOLDEN_REPO" ] || { echo "ERROR: legal.goldenRepo not set in $PROPS."; exit 1; }
[ -n "$LICENSED_WORK" ] || { echo "ERROR: legal.licensedWork not set in $PROPS."; exit 1; }

STRICT="${LEGAL_CHECK_STRICT:-0}"
FAILED=0

warn_or_fail() {
    if [ "$STRICT" = "1" ]; then
        echo "ERROR: $1"
        FAILED=1
    else
        echo "WARN: $1"
    fi
}

# Same message, never gates the build — used where content is expected to
# legitimately diverge per runtime (see legal:trademark above).
warn_info() {
    echo "WARN: $1 (informational — this marker is not a golden mirror)"
}

# Exactly {plain-words, trademark}. Never `exclusion`: a marker line inside a
# GFM table row terminates the table, and the exclusion clause already lives
# verbatim inside the plain-words region.
MARKERS="plain-words trademark"
# The subset of MARKERS whose content is a true cross-runtime mirror —
# the only ones a content mismatch can fail the build over.
MIRRORED_MARKERS="plain-words"
FILES="README.md LEAME.md LEIAME.md 自述文件.md"

is_mirrored_marker() {
    case " $MIRRORED_MARKERS " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# Line numbers of a marker's begin/end comments in $1, "<begin> <end>" (0 = absent).
marker_lines() {
    awk -v m="$2" '
        $0 ~ ("<!-- legal:" m ":begin -->") { b = NR }
        $0 ~ ("<!-- legal:" m ":end -->")   { e = NR }
        END { print b + 0, e + 0 }
    ' "$1"
}

# Verifies $1's legal:$2 marker is exactly one well-ordered begin/end pair.
check_marker_shape() {
    local file="$1" marker="$2" begins ends b e
    begins="$(grep -c -- "<!-- legal:${marker}:begin -->" "$file")"
    ends="$(grep -c -- "<!-- legal:${marker}:end -->" "$file")"
    if [ "$begins" -ne 1 ] || [ "$ends" -ne 1 ]; then
        warn_or_fail "$file: legal:$marker marker malformed (begin=$begins, end=$ends; expected exactly one pair)"
        return 1
    fi
    read -r b e <<EOF
$(marker_lines "$file" "$marker")
EOF
    if [ "$b" -eq 0 ] || [ "$e" -eq 0 ] || [ "$b" -ge "$e" ]; then
        warn_or_fail "$file: legal:$marker begin/end missing or out of order"
        return 1
    fi
    return 0
}

# Region content of $1's legal:$2 marker, marker comment lines excluded.
extract_region() {
    sed -n "/<!-- legal:$2:begin -->/,/<!-- legal:$2:end -->/p" "$1" | sed '1d;$d'
}

# Collapses all whitespace runs to a single space and trims the ends.
normalize_ws() {
    tr '\n\t' '  ' | tr -s ' ' | sed -e 's/^ *//' -e 's/ *$//'
}

echo ">> Marker well-formedness ..."
for file in $FILES; do
    if [ ! -f "$file" ]; then
        warn_or_fail "expected translated file missing: $file"
        continue
    fi
    for marker in $MARKERS; do
        check_marker_shape "$file" "$marker" || true
    done
done
echo ">>   done."

if [ -d "$GOLDEN_REPO" ]; then
    echo ">> Golden repo found at $GOLDEN_REPO — comparing against golden copies ..."

    GOLDEN_LICENSE="$GOLDEN_REPO/LICENSE"
    if [ -f "$GOLDEN_LICENSE" ]; then
        EXPECTED_LICENSE="$(mktemp)"
        trap 'rm -f "$EXPECTED_LICENSE"' EXIT
        # The one line the two repos' LICENSE files are allowed to differ on:
        # the Licensed Work's description. Everything else — placeholders
        # included — must come through byte-for-byte.
        sed -E "s/^(Licensed Work:[[:space:]]*).*( version \\{\\{VERSION\\}\\}\\..*)\$/\\1${LICENSED_WORK}\\2/" \
            "$GOLDEN_LICENSE" > "$EXPECTED_LICENSE"
        if [ -f LICENSE ]; then
            if ! diff -q "$EXPECTED_LICENSE" LICENSE >/dev/null 2>&1; then
                echo "--- LICENSE differs from the golden-derived expectation ---"
                diff "$EXPECTED_LICENSE" LICENSE || true
                warn_or_fail "LICENSE has drifted from the golden repo's LICENSE"
            fi
        else
            warn_or_fail "no local LICENSE to compare against the golden repo"
        fi
    else
        warn_or_fail "golden repo has no LICENSE at $GOLDEN_LICENSE"
    fi

    for file in $FILES; do
        [ -f "$file" ] || continue
        golden_file="$GOLDEN_REPO/$file"
        if [ ! -f "$golden_file" ]; then
            warn_or_fail "no matching golden file for $file at $golden_file"
            continue
        fi
        for marker in $MARKERS; do
            if ! check_marker_shape "$golden_file" "$marker" >/dev/null 2>&1; then
                warn_or_fail "$golden_file: legal:$marker missing/malformed in golden copy — cannot compare $file against it"
                continue
            fi
            local_norm="$(extract_region "$file" "$marker" | normalize_ws)"
            golden_norm="$(extract_region "$golden_file" "$marker" | normalize_ws)"
            if [ "$local_norm" != "$golden_norm" ]; then
                echo "--- legal:$marker region differs (whitespace-normalized): $file vs $golden_file ---"
                diff <(printf '%s\n' "$golden_norm") <(printf '%s\n' "$local_norm") || true
                if is_mirrored_marker "$marker"; then
                    warn_or_fail "$file: legal:$marker region text differs from golden $golden_file"
                else
                    warn_info "$file: legal:$marker region text differs from golden $golden_file"
                fi
            fi
        done
    done
    echo ">>   done."
else
    echo "NOTE: golden repo not found at $GOLDEN_REPO — skipping golden-copy comparison (CI without the sibling stays green)."
fi

if [ "$FAILED" -eq 1 ]; then
    echo "legal-check: FAILED (LEGAL_CHECK_STRICT=1)"
    exit 1
fi
echo "legal-check: OK$( [ "$STRICT" != "1" ] && echo ' (warn mode — set LEGAL_CHECK_STRICT=1 to enforce)')"
