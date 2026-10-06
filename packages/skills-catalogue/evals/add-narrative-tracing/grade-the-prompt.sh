#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# The whole of what the PUBLISHED init prompt promises, graded as world state (skill-harness-design.md
# principle 1: assert the world, never output text equality). Shared by both init-prompt cases; run
# with cwd set to the scaffolded fixture copy, from a case's graders/verify.sh, with $1 naming the
# service boundary that case's fixture defines.
#
# $NARRATIVETRACE_AGENT_TRANSCRIPT is OPTIONAL: set it to a file holding the agent's own output and
# step 3's gate can also be graded on what the agent showed, not only on what it left behind.
set -e

service="$1"
if [ -z "$service" ]; then
  echo "usage: grade-the-prompt.sh <TracedServiceName>" >&2
  exit 1
fi
here=$(dirname "$0")

# Step 2 and 4, at their cheapest observable: the project declares NarrativeTrace at all.
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  if (!names.some((n) => n.startsWith("@narrativetrace/"))) {
    console.error("expected package.json to declare a @narrativetrace/* package");
    process.exit(1);
  }
'

# Step 3, and its HUMAN GATE. The prompt says to run `narrativetrace init --dry-run`, show the diff,
# and apply it only once a person has seen it — so in a non-interactive trial the COMPLIANT outcome
# is "showed it and stopped". Two outcomes pass, and neither is required:
#   applied   — a skill page of ours is on disk, carrying the installer's own provenance line
#   previewed — @narrativetrace/cli is a dev dependency, so the task existed to be run (and, when a
#               transcript was captured, the preview command itself is in it)
# Only "neither" fails: an agent that never reached step 3 at all.
skills_applied=no
if grep -rqs "installed by narrativetrace init from" .agents/skills 2>/dev/null; then
  skills_applied=yes
  echo "step 3: the installer was applied — .agents/skills carries our provenance line"
elif node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  process.exit(pkg.devDependencies && pkg.devDependencies["@narrativetrace/cli"] ? 0 : 1);
' 2>/dev/null; then
  echo "step 3: @narrativetrace/cli is a dev dependency, so init --dry-run was there to run"
elif [ -n "$NARRATIVETRACE_AGENT_TRANSCRIPT" ] &&
  grep -qs "narrativetrace/cli init" "$NARRATIVETRACE_AGENT_TRANSCRIPT"; then
  echo "step 3: the transcript shows the installer preview"
else
  echo "step 3 left no trace: no @narrativetrace/cli dev dependency, no installed skills, no" >&2
  echo "preview in a transcript — the prompt's third step never happened" >&2
  exit 1
fi
export NT_SKILLS_APPLIED="$skills_applied"

# Step 6's first half, graded where the prompt puts it: the program's own standard output.
sh "$here/run-the-program.sh" "$service"

# Step 5: the redaction test exists, and passes. Existing is not enough — a test nobody can run
# proves nothing, and the doctor's trap.redaction-proof only ever reads the source.
sh "$here/run-redaction-test.sh"

# One of the prompt's own rules, as world state rather than as a promise.
if find . -name "*.received.nt" | grep -q .; then
  echo "the prompt forbids leaving .received.nt files behind" >&2
  exit 1
fi

# Step 6's second half: the doctor report, and every finding in it. `|| true`: a fully green report
# exits 0, but reading a failing one is this check's own job, not a reason to abort under `set -e`.
report=$(npx @narrativetrace/cli doctor --json || true)

echo "$report" | node -e '
  const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(report.findings) || report.findings.length !== 12) {
    console.error("expected the doctor to report twelve findings, got", report.findings && report.findings.length);
    process.exit(1);
  }
  // The prompt now reaches every check it can: it declares NarrativeTrace, proves redaction, and
  // (step 3) either applied or previewed the skills install. The one finding it cannot answer on
  // its own is whether the skills are INSTALLED — that is step 3'\''s human gate, which the prompt
  // deliberately leaves open, so it is graded only when the agent did apply it.
  const exempt = new Set(process.env.NT_SKILLS_APPLIED === "yes" ? [] : ["config.skills-installed"]);
  const bad = report.findings.filter((f) => f.status !== "pass" && !exempt.has(f.id));
  if (bad.length > 0) {
    console.error("expected every doctor finding to hold:", JSON.stringify(bad));
    process.exit(1);
  }
  console.log("grade-the-prompt.sh: the published init prompt produced a running trace, a passing redaction test");
  console.log("                     and a doctor report with nothing left to fix");
'
