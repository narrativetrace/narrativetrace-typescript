#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state + transcript verifier for narrativetrace-debug, the value-divergence case (design D6).
# Run with cwd set to the scaffolded fixture copy; $NARRATIVETRACE_TRANSCRIPT points at this trial's
# transcript.
#
# THE CASE
#
# Fixture: `existing-service-checkout-currency`. The ticket's charge is wrong by 23 centimes:
# `RateTableConverter.convert` rounds to whole francs before moving to cents. Every test is green
# as shipped. The defect shows only as a value at one span. Turn 2 is the scripted "yes, pin it".
#
# WHAT GATES (grade-the-debug.mjs)
#
# The reproduction's values were read before the first write to src/; the converter's span id —
# one the agent was SHOWN — is named in its own words before that write; nothing promoted before
# the yes, the turn before it ends on the question; the root cause is cited by that id in the
# agent's prose after the fix; the suite passes; the converter changed and converts the ticket's
# input to 4277 (a probe test); with the fixture's production code put back the suite fails (a
# regression test exists); the call shapes before and after the fix are identical (from the .md:
# a red run writes no .nt); a baseline pins a flow through the converter; no .received.nt is left.
#
# NEAR MISSES IT REFUSES
#
# A downstream fix (the charge rounded elsewhere) — the converter's value is still wrong. A route
# around the span (the charge computed without the converter) — the shape moved.
set -e

node "$(dirname "$0")/../../grade-the-debug.mjs"
