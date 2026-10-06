#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# Grades the published init prompt's step 5 — "Run the program" — as world state: the project the
# agent left behind RUNS, and its own standard output carries a rendered trace naming $1, the
# service boundary this case's fixture defines. Shared by both init-prompt cases; run with cwd set
# to the scaffolded fixture copy, from a case's graders/verify.sh.
#
# Why the program's stdout and not a file: the prompt sends the reader to llms.txt's "Install and
# first trace" block, which renders the trace with renderMarkdownBody and prints it via
# console.log, then runs it with `node index.js` (or the existing project's own `npm start`). A
# rendered narrativetrace-output/*.md is the OTHER path — the vitest integration's own test-time
# output, written by the redaction test this same prompt adds in step 4 — which "run the program"
# never asks for.
set -e

service="$1"
if [ -z "$service" ]; then
  echo "usage: run-the-program.sh <TracedServiceName>" >&2
  exit 1
fi
# $service goes straight into a grep -E pattern below (adversarial pass, 2026-09-26): a name
# outside plain-identifier shape would be read as regex syntax rather than a literal name, the
# same near-miss Java's own milestone 5 adversarial pass found and fixed for the identical reason.
case "$service" in
  *[!A-Za-z0-9_]*)
    echo "run-the-program.sh: '$service' is not a plain identifier — refusing rather than feeding it to a regex" >&2
    exit 1
    ;;
esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
log="$work/program-output.txt"

# The project's own entry point first — the existing-project fixture already declares "start":
# "node src/main.js", and an agent working inside it is expected to use that, not invent a second
# one. `index.js` at the root is the empty-project fallback: the exact file llms.txt's block tells
# the agent to create and run directly, for a project that never gained a "start" script.
has_start_script() {
  [ -f package.json ] && node -e '
    const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
    process.exit(pkg.scripts && pkg.scripts.start ? 0 : 1);
  '
}

if has_start_script; then
  timeout 120 npm start --silent >"$log" 2>&1 || {
    echo "\`npm start\` failed — the prompt says to run the program and read its output" >&2
    cat "$log" >&2
    exit 1
  }
elif [ -f index.js ]; then
  timeout 120 node index.js >"$log" 2>&1 || {
    echo "\`node index.js\` failed — the prompt says to run the program and read its output" >&2
    cat "$log" >&2
    exit 1
  }
else
  echo "no \"start\" script and no index.js — the prompt's \"Run the program\" step has nothing" >&2
  echo "to run in this project" >&2
  exit 1
fi

# A rendered trace line is `<Service>.<method>(...)` — from renderIndentedText, renderMarkdownBody
# or a structural renderer alike, which is what "whatever renderer produced it" can honestly mean
# here: the sequence-diagram renderers (`OrderService->>OrderService: placeOrder(...)`) and
# renderProse ("The order service placed order for ...") carry no service-qualified call token at
# all, and a guard loose enough to accept those would accept any line merely naming the service.
#
# renderMarkdownBody wraps the call in a code span — `` `OrderService.placeOrder(customerId:
# "C1", ...)` `` — so a backtick can sit right where the guard expects the method name's opening
# paren. Strip markup first. Only a backtick and `*` (Markdown's other emphasis marker, unused by
# this runtime's own renderers today but harmless to strip pre-emptively): neither can occur inside
# a JS identifier, so removing them can only rejoin fragments the guard already treated as
# separated. `_` is deliberately NOT stripped even though Markdown can emphasise with it — `_` IS a
# valid identifier character, so stripping it would let `Order_Service.placeOrder(` pass for
# `OrderService`. Both halves of the guard hold: the leading `(^|[^A-Za-z0-9_])` rejects
# `MyOrderService.placeOrder(`, the literal name rejects `IOrderService.placeOrder(`. The failure
# message prints the ORIGINAL output, not the stripped one.
LC_ALL=C tr -d '*`' <"$log" >"$work/unmarked.txt"
grep -Eq "(^|[^A-Za-z0-9_])${service}\.[A-Za-z_][A-Za-z0-9_]*\(" "$work/unmarked.txt" || {
  echo "expected the program's own output to carry a rendered trace line naming $service" >&2
  echo "--- what it printed instead ---" >&2
  cat "$log" >&2
  exit 1
}

echo "run-the-program.sh: the program ran and printed a rendered trace naming $service"
