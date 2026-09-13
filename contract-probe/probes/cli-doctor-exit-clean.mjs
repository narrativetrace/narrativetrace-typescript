// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// config-shape-cli-doctor-exit-clean: `npx narrativetrace doctor` exits 0 against a clean,
// healthy install (packages/cli/README.md: "Exit codes: 0 clean, 1 findings, 2 could not run").
import { execFileSync } from "node:child_process";

let observed = "exit-nonzero";
try {
  execFileSync("npx", ["narrativetrace", "doctor"], { stdio: "ignore" });
  observed = "exit-0";
} catch (error) {
  observed = error.status === 0 ? "exit-0" : "exit-nonzero";
}
console.log(observed);
