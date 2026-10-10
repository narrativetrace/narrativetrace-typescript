#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier for the clarity skill's happy path. Exit 0 = gate passed. Run with cwd set
# to the scaffolded fixture copy, this checkout's packages installed (`"setup": "checkout-install"`).
#
# THE CASE
#
# Fixture: `clarity-consumer` — a Vitest project that already traces a call but has NO clarity
# reporter registered and no gate script, and whose one service has an unclear name
# (`DataProcessor.execute(data)`, overall score 0.63 against the 0.80 the prompt asks for).
#
# Expected trajectory: the agent loads `add-narrativetrace-clarity`, registers `ClaritySuiteReporter`
# from `@narrativetrace/vitest/reporters`, runs the suite, reads `clarity-results.json`, adds a
# `clarity` script that runs `narrativetrace-clarity --min-score 0.8`, sees it fail naming
# `DataProcessor.execute`, renames the class, method and parameter everywhere they are used, and
# re-runs until the gate passes.
#
# Everything is graded in `grade-the-clarity-gate.mjs`, which prints one `clarity.<reason>` line
# per refusal. NOT GRADED HERE: the quality of the explanation (a judged measure, report-only).
set -e

node "$(dirname "$0")/../../grade-the-clarity-gate.mjs"
