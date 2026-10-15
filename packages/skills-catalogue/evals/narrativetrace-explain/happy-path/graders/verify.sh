#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# narrativetrace-explain / happy-path — the same flow, the same fixture and the same grader as
# explain-an-unfamiliar-flow, asked with the skill named ("Use the narrativetrace-explain skill
# to…"), the way the verify and debug cases name theirs: whether a phrasing TRIGGERS the skill is
# what trigger.yaml measures, and this case measures the loop once it runs. That case's header
# documents every gate.
set -e

node "$(dirname "$0")/../../grade-the-explain.mjs" --kind explain
