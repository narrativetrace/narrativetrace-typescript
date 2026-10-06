#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier for the PUBLISHED init prompt, existing-project branch (the prompt's own
# step 2, second half: "otherwise work inside the existing project and trace one real service
# boundary"). Fixture: evals/fixtures/existing-service — one service boundary, two passing tests,
# no NarrativeTrace anywhere.
#
# This case's prompt.md is the prompt and nothing else — see the empty-project case's grader
# header for why, and evals/README.md for the case's own documentation.
#
# Everything the prompt promises is graded in the shared ../grade-the-prompt.sh (package.json
# declares NarrativeTrace, step 3's human gate, the trace, the redaction test, no `.received.nt`,
# the fully-green doctor report). What stays here is this branch's own subject — step 2's other
# half: the existing project still works (its own `node --test` suite still passes, so "trace one
# real service boundary" did not become "rewrite the service"), and the trace really does name the
# fixture's own interface.
#
# Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e

test -f src/invoice-service.js || {
  echo "the fixture's existing implementation must still be there" >&2
  exit 1
}

node --test

sh "$(dirname "$0")/../../grade-the-prompt.sh" InvoiceService
