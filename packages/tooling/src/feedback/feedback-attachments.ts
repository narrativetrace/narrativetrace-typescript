// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The only two attachment kinds a report may carry: the doctor's own JSON report, and at most one
 * structural trace.
 *
 * INTENT: a closed set, because every other artifact a project has carries runtime values. A
 * rendered narrative, a log file and a source file are all refused by construction here rather than
 * by a rule — there is no field to put them in.
 *
 * @llmNote `doctorReport` and `doctorUnavailable` are exclusive and exhaustive (design Q3 as
 * ruled): exactly one is non-blank. "No doctor report and no reason" would read, to triage, as a
 * reporter who did not bother rather than as a project whose doctor cannot run — and those two get
 * different answers.
 */
export interface Attachments {
  /** The doctor's JSON report verbatim, or `""`. */
  readonly doctorReport: string;
  /** Why there is no doctor report, or `""` when there is one. */
  readonly doctorUnavailable: string;
  /** One `.nt` file's content, or `""`. */
  readonly structuralTrace: string;
}

function attachments(
  doctorReport: string,
  doctorUnavailable: string,
  structuralTrace: string,
): Attachments {
  if (
    typeof doctorReport !== "string" ||
    typeof doctorUnavailable !== "string" ||
    typeof structuralTrace !== "string"
  ) {
    throw new TypeError('an absent attachment is "", never null');
  }
  if ((doctorReport.trim() === "") === (doctorUnavailable.trim() === "")) {
    throw new RangeError(
      "a report carries the doctor's JSON or says why it has none, never both and never neither",
    );
  }
  return { doctorReport, doctorUnavailable, structuralTrace };
}

/** A report with the doctor's JSON, and optionally one structural trace. */
export function attachmentsOf(doctorReport: string, structuralTrace: string): Attachments {
  return attachments(doctorReport, "", structuralTrace);
}

/** A report whose project could not run the doctor, with the reason it could not. */
export function attachmentsWithoutDoctorReport(
  reason: string,
  structuralTrace: string,
): Attachments {
  return attachments("", reason, structuralTrace);
}

/** Whether the doctor's own JSON is attached. */
export function hasDoctorReport(set: Attachments): boolean {
  return set.doctorReport.trim() !== "";
}

/** Whether a structural trace is attached. */
export function hasStructuralTrace(set: Attachments): boolean {
  return set.structuralTrace.trim() !== "";
}
