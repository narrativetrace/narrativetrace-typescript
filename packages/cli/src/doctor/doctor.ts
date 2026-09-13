// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { checkApprovalTraces } from "./checks/approval-traces.js";
import { checkLlmsBeforeYouStart } from "./checks/llms-before-you-start.js";
import { checkNodeEngine } from "./checks/node-engine.js";
import { checkOutputEnv } from "./checks/output-env.js";
import { checkParameterArg0 } from "./checks/parameter-arg0.js";
import { checkRedactionProof } from "./checks/redaction-proof.js";
import { checkReporterSubpath } from "./checks/reporter-subpath.js";
import { checkSiblingPackages } from "./checks/sibling-packages.js";
import { checkSilentSink } from "./checks/silent-sink.js";
import { checkTraceObjectKeys } from "./checks/trace-object-keys.js";
import { checkVitestPeer } from "./checks/vitest-peer.js";
import type { DoctorCheck, DoctorReport, DoctorSnapshot } from "./types.js";

/**
 * Every check `narrativetrace doctor` runs, in stable, documented order. Adding a check means
 * appending here — the id is what stays stable across releases, not the position.
 */
export const DOCTOR_CHECKS: readonly DoctorCheck[] = [
  checkNodeEngine,
  checkVitestPeer,
  checkSiblingPackages,
  checkOutputEnv,
  checkReporterSubpath,
  checkTraceObjectKeys,
  checkSilentSink,
  checkParameterArg0,
  checkRedactionProof,
  checkApprovalTraces,
  checkLlmsBeforeYouStart,
];

/** Runs every check over `snapshot` and derives the process exit code. Read-only: mutates nothing. */
export function runDoctor(snapshot: DoctorSnapshot): DoctorReport {
  const findings = DOCTOR_CHECKS.map((check) => check(snapshot));
  const exitCode = findings.some((f) => f.status === "fail") ? 1 : 0;
  return { findings, exitCode };
}
