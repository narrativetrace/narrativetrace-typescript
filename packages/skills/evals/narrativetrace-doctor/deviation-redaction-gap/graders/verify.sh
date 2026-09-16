#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier. Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e

# Same fixture-exit contract as the happy-path grader: trap.redaction-proof is documented to fail
# on this fixture (the parameter is deny-listed but unproven), so doctor's exit is always 1
# (findings.some(fail) => 1). Capture it explicitly — `&&`/`||` keeps `set -e` from aborting the
# script the instant doctor exits nonzero — and assert it before the shape assertions run.
report=$(npx @narrativetrace/cli doctor --json) && exit_code=0 || exit_code=$?
if [ "$exit_code" -ne 1 ]; then
  echo "expected doctor to exit 1 (trap.redaction-proof fails on this fixture), got $exit_code" >&2
  exit 1
fi

echo "$report" | node -e '
  const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const byId = new Map(report.findings.map((f) => [f.id, f]));
  if (byId.get("trap.redaction-proof")?.status !== "fail") {
    console.error("expected trap.redaction-proof to fail on the redaction-gap fixture");
    process.exit(1);
  }
  console.log("verify.sh: doctor correctly flags the unproven redaction");
'
