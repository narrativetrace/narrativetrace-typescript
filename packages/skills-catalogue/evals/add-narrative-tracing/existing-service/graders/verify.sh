#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier for the install page's tests branch (B-92): a project WITH tests on a runner
# the runtime integrates takes its first trace from one existing test, which leaves `.md` and `.nt`
# files under narrativetrace-output/. Fixture: evals/fixtures/existing-service-vitest.
# The grader runs the project's own test script itself; nothing is read from the transcript.
# Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e
. "$(dirname "$0")/../../bounded.sh"

node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const declared = { ...pkg.devDependencies, ...pkg.dependencies };
  const missing = ["@narrativetrace/proxy", "@narrativetrace/vitest"].filter((n) => !declared[n]);
  if (missing.length > 0) {
    console.error("expected package.json to declare", missing.join(", "));
    process.exit(1);
  }
'

test -f src/invoice-service.js && test -f test/invoice-service.test.js || {
  echo "the fixture's own service and test must still be there" >&2
  exit 1
}

# The project's own suite passes (it also leaves the files graded below).
bounded 300 npm test --silent >/dev/null 2>&1 || {
  echo "expected the project's own \`npm test\` to exit 0" >&2
  exit 1
}

node -e '
  const fs = require("fs"), path = require("path");
  function walk(d) {
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  }
  const files = walk("narrativetrace-output");
  for (const ext of [".md", ".nt"]) {
    if (!files.some((f) => f.endsWith(ext))) {
      console.error("expected at least one " + ext + " file under narrativetrace-output");
      process.exit(1);
    }
  }
'

report=$(npx @narrativetrace/cli doctor --json) && exit_code=0 || exit_code=$?
if [ "$exit_code" -ne 0 ] && [ "$exit_code" -ne 1 ]; then
  echo "expected doctor to exit 0 or 1, never crash, got $exit_code" >&2
  exit 1
fi
printf '%s\n' "$report" | node -e '
  const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const bad = report.findings.filter((f) => f.id.startsWith("toolchain.") && f.status !== "pass");
  if (bad.length > 0) {
    console.error("expected every toolchain.* doctor finding to hold:", JSON.stringify(bad));
    process.exit(1);
  }
  console.log("verify.sh: the tests branch left .md and .nt files and a clean toolchain");
'
