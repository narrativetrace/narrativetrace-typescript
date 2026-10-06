#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# Grades the published init prompt's step 4 — "Add one test that traces a call with a deny-listed
# parameter and asserts the trace shows `[REDACTED]` for it" — the same way the doctor's own
# trap.redaction-proof check reads it: a real test file (`*.test.*`/`*.spec.*`, never a `.snap` or
# a mid-filename `.test.`) whose content contains the literal string `[REDACTED]`. Shared by both
# init-prompt cases; run with cwd set to the scaffolded fixture copy, from a case's
# graders/verify.sh.
#
# The prompt names no test framework — "Add one test", not "add a vitest test" — and the first
# real Haiku trial against the existing-service fixture (2026-09-25) proved that matters: it added
# the redaction assertion to the project's OWN `node --test` file rather than pulling in vitest at
# all, which is at least as faithful a reading as this repo's own docs (which lean on
# @narrativetrace/vitest). Each matched file is run with the tool ITS OWN imports name — `node
# --test` for a file importing "node:test", `vitest run` otherwise — always scoped to just that
# file, never a bare run over the whole project: the existing-project fixture ships its own
# `node --test` suite, and each runner's default discovery picks up the OTHER runner's file by
# filename glob alone and crashes on it (node --test throws on a bare `vitest` import; `vitest
# run` fails a node:test file with "No test suite found").
set -e

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
node_test_matches="$work/node-test-matches.txt"
vitest_matches="$work/vitest-matches.txt"

node -e '
  const fs = require("fs"), path = require("path");
  const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
  const REDACTED_ASSERTION = /\[REDACTED\]/;
  const NODE_TEST_IMPORT = /\bfrom\s+["\x27]node:test["\x27]|require\(\s*["\x27]node:test["\x27]\s*\)/;
  const SKIP_DIRS = new Set(["node_modules", ".git"]);
  function walk(d) {
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      if (SKIP_DIRS.has(e.name)) return [];
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  }
  const hits = walk(".").filter((f) => TEST_FILE.test(f));
  const nodeTest = [], vitest = [];
  for (const f of hits) {
    const content = fs.readFileSync(f, "utf8");
    if (!REDACTED_ASSERTION.test(content)) continue;
    (NODE_TEST_IMPORT.test(content) ? nodeTest : vitest).push(f);
  }
  fs.writeFileSync(process.argv[1], nodeTest.join("\n"));
  fs.writeFileSync(process.argv[2], vitest.join("\n"));
' "$node_test_matches" "$vitest_matches"

if [ ! -s "$node_test_matches" ] && [ ! -s "$vitest_matches" ]; then
  echo "expected a test file (*.test.*/*.spec.*) asserting [REDACTED] — none found" >&2
  exit 1
fi

# shellcheck disable=SC2046
if [ -s "$node_test_matches" ] && ! node --test $(tr '\n' ' ' <"$node_test_matches") \
  >"$work/node-test-output.txt" 2>&1; then
  echo "the redaction test does not pass (node --test):" >&2
  cat "$work/node-test-output.txt" >&2
  exit 1
fi

# shellcheck disable=SC2046
if [ -s "$vitest_matches" ] && ! npx vitest run $(tr '\n' ' ' <"$vitest_matches") \
  >"$work/vitest-output.txt" 2>&1; then
  echo "the redaction test does not pass (vitest run):" >&2
  cat "$work/vitest-output.txt" >&2
  exit 1
fi

echo "run-redaction-test.sh: a test asserts [REDACTED] and the scoped run passed"
