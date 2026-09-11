// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { type CommandOutcome, runCommand } from "./verify-all-exec.js";

export interface MetricsOutcome {
  readonly outcome: CommandOutcome;
  readonly findings: number;
}

const VIOLATION_LINE = /^(\d+) function\(s\) exceed \d+-line limit:/m;

/** Runs the repo's own 20-line method-length gate (`tools/metrics.ts`) and counts its own violation total. */
export function runMetricsGate(repoRoot: string, logDir: string): MetricsOutcome {
  const outcome = runCommand("npx", ["tsx", "tools/metrics.ts"], join(logDir, "complexity.log"), {
    cwd: repoRoot,
  });
  const match = VIOLATION_LINE.exec(outcome.output);
  return { outcome, findings: match ? Number.parseInt(match[1] as string, 10) : 0 };
}
