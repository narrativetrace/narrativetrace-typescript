#!/bin/sh
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# World-state verifier (skill-harness-design.md principle 1: assert the world, never output text
# equality). Exit 0 = gate passed. Run with cwd set to the scaffolded fixture copy.
set -e

node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (pkg.type !== "module") {
    console.error("expected package.json to declare \"type\": \"module\"");
    process.exit(1);
  }
'

node -e '
  const fs = require("fs"), path = require("path");
  function walk(d) {
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  }
  const md = walk("narrativetrace-output").filter((f) => f.endsWith(".md"));
  if (md.length === 0) {
    console.error("expected at least one rendered .md trace under narrativetrace-output");
    process.exit(1);
  }
'

report=$(npx narrativetrace doctor --json)
echo "$report" | node -e '
  const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const bad = report.findings.filter((f) => f.id.startsWith("toolchain.") && f.status !== "pass");
  if (bad.length > 0) {
    console.error("expected every toolchain.* finding to hold:", JSON.stringify(bad));
    process.exit(1);
  }
  console.log("verify.sh: cold install produced a rendered trace and a clean toolchain");
'
