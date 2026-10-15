#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# narrativetrace-explain / pure-function-control — the negative case, and the one that proves the
# skill's cost rule rather than its loop.
#
# Fixture: existing-service-checkout. feeFor in src/late-fees.js is a pure function with no
# collaborator: 150 cents per day late, zero when it is not late. Its whole behaviour is a few lines
# of source, so the skill's first step must answer FROM THE SOURCE and stop. PASS: no build file
# changed (nothing was installed), no source changed, the tests never ran, nothing was traced, and
# the answer names the method, the rate and the not-late case. Loading the skill to make that
# decision is fine — its first step IS the decision; installing, running or tracing after it is the
# failure. Near misses: a trace of a pure function; an answer that runs the suite "to be sure"; an
# answer that describes the method without its numbers.
set -e

node "$(dirname "$0")/../../grade-the-explain.mjs" --kind control
