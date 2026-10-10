#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier for the PUBLISHED init prompt on an existing Express API — Phase 6's Tier B
# case (design D4): an existing project on this runtime's main web framework, graded on the
# doctor's framework check turning green and a request-scoped trace in the program's own output.
# Fixture: evals/fixtures/express-service — OrderService behind POST /orders, a main.js that places
# two orders against the running API, two passing `node --test` tests, no NarrativeTrace anywhere.
# The case's "setup": "checkout-registry" serves THIS checkout's @narrativetrace/* packages, so the
# doctor the agent and this grader run is the one that carries the framework table.
#
# prompt.md is the prompt and nothing else (evals/README.md, "The init-prompt cases").
#
# Everything the prompt promises is graded in the shared ../grade-the-prompt.sh, including a FULLY
# green doctor report — which now holds config.express-middleware. What stays here is this case's
# own subject:
#   1. the existing API still works — its OWN test file, run alone (a bare `node --test` would also
#      collect a vitest redaction test the agent may add, and crash on it);
#   2. config.express-middleware passes by name: @narrativetrace/express installed AND wired;
#   3. the trace is request-scoped: the program makes two requests, and its output carries a
#      rendered OrderService.placeOrder( line for each — printed by the middleware's per-request
#      hook, so one global trace captured at exit would not do (it is wired, check 2, and per
#      request, check 3; the grader cannot tell those apart from text alone beyond that).
#
# Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e
here=$(dirname "$0")

test -f src/order-service.js || {
  echo "the fixture's existing service must still be there" >&2
  exit 1
}

node --test test/app.test.js

sh "$here/../../grade-the-prompt.sh" OrderService

report=$(npx @narrativetrace/cli doctor --json || true)
printf '%s\n' "$report" | node -e '
  const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const finding = report.findings.find((f) => f.id === "config.express-middleware");
  if (!finding) {
    console.error("the doctor ran no config.express-middleware check — not the checkout'\''s doctor?");
    process.exit(1);
  }
  if (finding.status !== "pass") {
    console.error("config.express-middleware:", finding.message);
    process.exit(1);
  }
  console.log("config.express-middleware:", finding.message);
'

output=$(timeout 120 npm start --silent 2>&1) || {
  echo "\`npm start\` failed:" >&2
  printf '%s\n' "$output" >&2
  exit 1
}
traced=$(printf '%s\n' "$output" | LC_ALL=C tr -d '*`' | grep -Ec '(^|[^A-Za-z0-9_])OrderService\.placeOrder\(' || true)
if [ "$traced" -lt 2 ]; then
  echo "expected a rendered OrderService.placeOrder( line for each of the program's two requests," >&2
  echo "got $traced — the program printed:" >&2
  printf '%s\n' "$output" >&2
  exit 1
fi
echo "init-prompt-express-project: the middleware is wired and each request printed its own trace"
