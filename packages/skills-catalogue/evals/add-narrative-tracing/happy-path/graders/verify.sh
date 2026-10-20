#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier (skill-harness-design.md principle 1: assert the world, never output text
# equality). Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e

node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (pkg.type !== "module") {
    console.error("expected package.json to declare \"type\": \"module\"");
    process.exit(1);
  }
'

node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const declared = { ...pkg.devDependencies, ...pkg.dependencies };
  const missing = ["@narrativetrace/core-node", "@narrativetrace/proxy"].filter((n) => !declared[n]);
  if (missing.length > 0) {
    console.error("expected package.json to declare", missing.join(", "));
    process.exit(1);
  }
'

# The premise this case sets: an empty project with NO tests, so the install page's first trace is
# the standalone script, which prints the rendered trace to the console and writes nothing to disk
# (B-92). The grader therefore RUNS what the agent left — the entry package.json declares (a
# `start` script, else `main`), else the page's own index.js / index.mjs — and asserts it exits 0
# and its output carries a rendered trace line, `<Class>.<method>(`. The program is read from the
# project's files, never from the transcript, and no `.md` file is expected (nor is a test runner).
. "$(dirname "$0")/../../bounded.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
entry=$(node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (pkg.scripts && pkg.scripts.start) { console.log("npm start --silent"); process.exit(0); }
  const files = [pkg.main, "index.js", "index.mjs"].filter((f) => f && fs.existsSync(f));
  if (files.length > 0) console.log("node " + files[0]);
')
if [ -z "$entry" ]; then
  echo "no \"start\" script, no \"main\" file and no index.js: nothing to run for the first trace" >&2
  exit 1
fi
# shellcheck disable=SC2086 # $entry is a fixed command line built above, split on purpose
bounded 120 $entry >"$work/out.txt" 2>&1 || {
  echo "\`$entry\` failed — the first trace is a program that runs" >&2
  cat "$work/out.txt" >&2
  exit 1
}
LC_ALL=C tr -d '*`' <"$work/out.txt" >"$work/unmarked.txt"
grep -Eq '(^|[^A-Za-z0-9_])[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\(' "$work/unmarked.txt" || {
  echo "expected the program's output to carry a rendered trace line, <Class>.<method>(" >&2
  cat "$work/out.txt" >&2
  exit 1
}

# Unlike the narrativetrace-doctor cases, this fixture is modified by the agent before doctor
# runs (packages installed, a demo written), so its exact exit code isn't fixture-documented —
# but the CLI's own contract still promises 0 or 1, never a crash. Capture the exit code
# explicitly (`&&`/`||` keeps `set -e` from aborting on a nonzero doctor exit) so a real, expected
# fail (e.g. trap.redaction-proof, unproven in this fixture too) doesn't skip the toolchain.*
# assertions below the way a bare `report=$(npx ... --json)` under `set -e` would.
report=$(npx @narrativetrace/cli doctor --json) && exit_code=0 || exit_code=$?
if [ "$exit_code" -ne 0 ] && [ "$exit_code" -ne 1 ]; then
  echo "expected doctor to exit 0 or 1, never crash, got $exit_code" >&2
  exit 1
fi
# printf, never echo: dash's echo turns the JSON's escaped \n back into a line break.
printf '%s\n' "$report" | node -e '
  const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const bad = report.findings.filter((f) => f.id.startsWith("toolchain.") && f.status !== "pass");
  if (bad.length > 0) {
    console.error("expected every toolchain.* finding to hold:", JSON.stringify(bad));
    process.exit(1);
  }
  console.log("verify.sh: cold install produced a runnable demo that prints a trace, and a clean toolchain");
'
