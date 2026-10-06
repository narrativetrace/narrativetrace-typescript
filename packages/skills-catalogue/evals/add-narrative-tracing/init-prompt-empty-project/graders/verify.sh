#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier for the PUBLISHED init prompt, empty-directory branch (the prompt's own
# step 2, first half: "if this directory has no project yet, create the smallest console app that
# llms.txt's 'Install and first trace' block describes").
#
# This case's prompt.md is the prompt and nothing else — the text the README, the three README
# mirrors and documentation/llms.txt all publish, pinned byte-identical by
# packages/skills-catalogue/__tests__/init-prompt-drift.test.ts. Everything a case would normally say in its
# prompt.md preamble is said here and in evals/README.md instead, because the runner hands the
# WHOLE prompt file to the agent: a "# Case:" heading would be part of the prompt under test.
#
# Everything the prompt promises is graded in the shared ../grade-the-prompt.sh: package.json
# declares NarrativeTrace; step 3's human gate (applied or previewed, never neither); the program
# runs and its own stdout carries a rendered trace naming the service; a passing redaction test; no
# `.received.nt`; the doctor report FULLY green (config.skills-installed exempted on the previewed
# branch — that is its own job to report, not this branch's).
#
# Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e

sh "$(dirname "$0")/../../grade-the-prompt.sh" OrderService

node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (pkg.type !== "module") {
    console.error("expected package.json to declare \"type\": \"module\" (llms.txt install block step 1)");
    process.exit(1);
  }
'
