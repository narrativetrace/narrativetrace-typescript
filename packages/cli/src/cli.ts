// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { runDoctor } from "./doctor/doctor.js";
import { renderHuman, renderJson } from "./doctor/render.js";
import type { DoctorSnapshot, Env } from "./doctor/types.js";

const USAGE = `narrativetrace — one CLI over NarrativeTrace's open artifact formats

Usage:
  narrativetrace doctor [--json]

Commands:
  doctor    Read-only project diagnosis: toolchain, configuration, and known traps. Zero network.

Options:
  --json    Machine-readable output instead of human text.
  --help    Show this message.`;

const DOCTOR_USAGE = `narrativetrace doctor [--json]

Read-only. Checks toolchain/install state, configuration, and known traps against the current
project. Exit 0 = clean, 1 = findings, 2 = could not run.`;

export interface CliDeps {
  readonly cwd: string;
  readonly env: Env;
  readonly buildSnapshot: (cwd: string, env: Env) => DoctorSnapshot;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

/** Runs `doctor` once argv has been recognized as that command. Returns the process exit code. */
function runDoctorCommand(rest: readonly string[], deps: CliDeps): number {
  if (rest.includes("--help") || rest.includes("-h")) {
    deps.log(DOCTOR_USAGE);
    return 0;
  }
  const json = rest.includes("--json");
  const unknown = rest.filter((arg) => arg !== "--json");
  if (unknown.length > 0) {
    deps.error(`Unknown argument(s) for doctor: ${unknown.join(", ")}\n\n${DOCTOR_USAGE}`);
    return 2;
  }
  const snapshot = deps.buildSnapshot(deps.cwd, deps.env);
  if (!snapshot.rootPackageJson) {
    deps.error(`Could not run: no readable package.json found at ${deps.cwd}`);
    return 2;
  }
  const report = runDoctor(snapshot);
  deps.log(json ? renderJson(report) : renderHuman(report));
  return report.exitCode;
}

/** Parses argv and runs the requested command. Returns the process exit code. */
export function runCli(argv: string[], deps: CliDeps): number {
  const [verb, ...rest] = argv;
  if (verb === undefined) {
    deps.error(USAGE);
    return 2;
  }
  if (verb === "--help" || verb === "-h") {
    deps.log(USAGE);
    return 0;
  }
  if (verb !== "doctor") {
    deps.error(`Unknown command: ${verb}\n\n${USAGE}`);
    return 2;
  }
  return runDoctorCommand(rest, deps);
}
