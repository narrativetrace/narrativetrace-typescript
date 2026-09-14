#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier (skill-harness-design.md principle 1: assert the world, never output text
# equality). Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e

# The doctor CLI's own contract (Finding: findings.some(fail) => exit 1, else 0) means this
# fixture's documented correct exit is 1 — trap.redaction-proof is the one real finding this
# fixture has (no sensitive parameter name to redact). Capture the exit code explicitly (the
# `&&`/`||` pair keeps `set -e` from aborting on it) and ASSERT it before the shape assertions
# below ever run — a bare `report=$(npx ... --json)` under `set -e` would abort the whole script
# the instant doctor exits 1, silently skipping every assertion that follows.
report=$(npx narrativetrace doctor --json) && exit_code=0 || exit_code=$?
if [ "$exit_code" -ne 1 ]; then
  echo "expected doctor to exit 1 (trap.redaction-proof fails on the unmodified fixture), got $exit_code" >&2
  exit 1
fi

echo "$report" | node -e '
  const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(report.findings) || report.findings.length !== 11) {
    console.error("expected 11 findings, got", report.findings?.length);
    process.exit(1);
  }
  const byId = new Map(report.findings.map((f) => [f.id, f]));
  if (byId.get("trap.redaction-proof")?.status !== "fail") {
    console.error("expected trap.redaction-proof to fail on the unmodified fixture");
    process.exit(1);
  }
  console.log("verify.sh: doctor report is well-formed and matches the known fixture shape");
'
