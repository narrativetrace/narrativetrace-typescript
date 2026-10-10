// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { DoctorSnapshot } from "../doctor/types.js";
import {
  type Attachments,
  attachmentsOf,
  attachmentsWithoutDoctorReport,
} from "./feedback-attachments.js";
import { looksStructural } from "./structural-trace.js";
import { rulesRefusing } from "./value-free-check.js";

/**
 * What the verb can learn about a project without being told: which NarrativeTrace it resolved, and
 * which structural trace is safe to attach.
 *
 * INTENT: the two facts triage needs most are the two a reporter is least likely to get right by
 * hand. The install coordinate decides whether a defect is already fixed; the structural trace shows
 * the shape of the call that misbehaved. Both are read from the doctor's own snapshot, so the report
 * and the doctor cannot disagree about the project they are describing.
 *
 * @llmNote A trace is chosen only if it is BOTH a structural trace by grammar and clean by every
 * value-free rule, and when none is, the choice says why rather than attaching nothing silently. A
 * report that quietly lost its attachment is a report whose author thinks they filed more than they
 * did.
 *
 * @sideEffects None: a pure function over a snapshot. Building the snapshot and running the doctor
 * are the entry point's job, and their results are passed in here.
 */

/** What the install field says when the project resolved none of our packages. */
export const INSTALL_UNKNOWN = "no @narrativetrace package resolved from this project";

/** What the attachment set says when the doctor could not produce a report at all. */
export const DOCTOR_UNAVAILABLE =
  "the doctor could not run here — no readable package.json at this project root";

const SCOPE = "@narrativetrace/";

/** Which structural trace was chosen, or why none was. */
export interface TraceChoice {
  /** The trace's content, or `""` when none was chosen. */
  readonly content: string;
  /** Why nothing was chosen, or `""` when something was. */
  readonly reason: string;
}

/**
 * Every NarrativeTrace package the project RESOLVED, with the version it resolved to.
 *
 * @llmNote Resolved rather than declared, which is the design's own wording ("the coordinate the
 * project resolved"). A `package.json` line says what somebody asked for; the resolved
 * `package.json` of the installed package says what the defect was actually hit with, and those
 * differ exactly when a range moved — which is the case triage most needs to see.
 */
export function installCoordinate(snapshot: DoctorSnapshot): string {
  const ours = [...snapshot.installedPackages]
    .filter(([name]) => name.startsWith(SCOPE))
    .map(([name, pkg]) => `${name}@${pkg.version ?? "unknown version"}`)
    .sort();
  return ours.length === 0 ? INSTALL_UNKNOWN : ours.join(", ");
}

/** Every `.nt` the snapshot saw, in path order so two runs choose the same one. */
function structuralCandidates(snapshot: DoctorSnapshot): Map<string, string> {
  const candidates = new Map<string, string>();
  for (const source of [snapshot.outputFiles, snapshot.approvedDirFiles]) {
    for (const [path, content] of source) {
      if (path.endsWith(".nt")) candidates.set(path, content);
    }
  }
  // Ordinal comparison, and never an equal arm: these are Map KEYS, so no two are the same
  // string. An `=== 0` branch here would be a case no input can reach, reading as a decision.
  return new Map([...candidates].sort(([a], [b]) => (a < b ? -1 : 1)));
}

function isAttachable(content: string): boolean {
  return looksStructural(content) && rulesRefusing(content).length === 0;
}

/** Why one candidate was not attachable, in the words the verb prints. */
function whyNot(content: string): string {
  if (!looksStructural(content)) return "is not a structural trace";
  return `breaks ${rulesRefusing(content)
    .map((rule) => rule.id)
    .join(", ")}`;
}

function refusalFor(candidates: ReadonlyMap<string, string>): string {
  const first = [...candidates][0];
  if (first === undefined) return "no structural trace was found under this project's output";
  return `no attachable structural trace: ${first[0]} ${whyNot(first[1])}`;
}

function named(candidates: ReadonlyMap<string, string>, preferredPath: string): TraceChoice {
  for (const [path, content] of candidates) {
    if (!path.endsWith(preferredPath)) continue;
    return isAttachable(content)
      ? { content, reason: "" }
      : { content: "", reason: `${preferredPath} ${whyNot(content)}` };
  }
  return { content: "", reason: `${preferredPath} was not found under this project's output` };
}

/**
 * The structural trace to attach.
 *
 * @param preferredPath a path suffix the user named, or `""` to let the verb choose.
 */
export function chooseTrace(snapshot: DoctorSnapshot, preferredPath: string): TraceChoice {
  const candidates = structuralCandidates(snapshot);
  if (preferredPath.trim() !== "") return named(candidates, preferredPath);
  for (const [, content] of candidates) {
    if (isAttachable(content)) return { content, reason: "" };
  }
  return { content: "", reason: refusalFor(candidates) };
}

/** The attachment set: the doctor's JSON when there is one, and at most one structural trace. */
export function feedbackAttachments(
  snapshot: DoctorSnapshot,
  doctorReportJson: string,
  preferredTracePath: string,
): Attachments {
  const trace = chooseTrace(snapshot, preferredTracePath).content;
  if (doctorReportJson.trim() === "") {
    return attachmentsWithoutDoctorReport(DOCTOR_UNAVAILABLE, trace);
  }
  return attachmentsOf(doctorReportJson, trace);
}
