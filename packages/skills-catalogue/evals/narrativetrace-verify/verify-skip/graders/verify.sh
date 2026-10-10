#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state + transcript verifier for narrativetrace-verify, the skip case (design D2).
# Run with cwd set to the scaffolded fixture copy; $NARRATIVETRACE_TRANSCRIPT points at this trial's
# transcript.
#
# THE CASE
#
# Fixture: `existing-service-checkout`. The task caps a pure function (`feeFor` in
# src/late-fees.js). The skill's cost rule says such a change is NOT traced: the agent says it
# skipped the skill and why.
#
# WHAT GATES (grade-the-verify.mjs --kind skip)
#
# The suite passes; feeFor(1000) is 2000 and feeFor(3) still 450 (a probe test, added and
# removed); no structural trace was read; no baseline was written and approval mode was not
# switched on; the agent's own words say it skipped, with a reason (a pure function, a one-class
# edit, no collaborator).
set -e

node "$(dirname "$0")/../../grade-the-verify.mjs" --kind skip
