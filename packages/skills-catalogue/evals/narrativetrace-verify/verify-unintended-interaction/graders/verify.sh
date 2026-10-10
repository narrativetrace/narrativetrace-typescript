#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state + transcript verifier for narrativetrace-verify, the unintended-interaction case.
# Run with cwd set to the scaffolded fixture copy; $NARRATIVETRACE_TRANSCRIPT points at this trial's
# transcript, which lives outside this project.
#
# THE CASE
#
# Fixture: `existing-service-checkout`, this checkout's packages and skills installed into it
# (`"setup": "checkout-install"`). The task adds a receipt; the checkout kit's README says its
# `onPaid` hooks run once the payment has gone through, but the (minified, vendored) kit calls them
# BEFORE settling — so a receipt sent from a hook precedes `PaymentGateway.confirm`, and every test
# still passes. Only the structural trace shows the order. Turn 2 is the scripted "yes, pin it".
#
# WHAT GATES (grade-the-verify.mjs --kind interaction, by ORDER, never by turn number)
#
# The intent is written before the traced run and before any .nt is read; values are not opened
# before the structure; nothing is promoted before the yes, and the turn before it ends on the
# question; the suite passes; in the final flow trace NotificationService.send follows
# PaymentGateway.confirm; an approved baseline pins that order and no .received.nt is left; the
# report cites a span id that is in the pinned baseline.
#
# NOT GRADED HERE
#
# Whether what was promoted was shown whole before the yes: report-only on the cheapest model.
set -e

node "$(dirname "$0")/../../grade-the-verify.mjs" --kind interaction
