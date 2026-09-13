// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type ApprovalTraceOutcome,
  type ArtifactIdentity,
  evaluateApprovalTrace,
  fileSlug,
  moduleDirectorySlug,
  renderStructuralDocument,
  type ScenarioDelta,
  scenarioDelta,
  type TraceTree,
} from "@narrativetrace/core-node";

/** Injected filesystem seam — an absent file reads as `undefined`, never throws. */
export interface StructuralIo {
  readFile: (path: string) => string | undefined;
  writeFile: (path: string, content: string) => void;
  mkdir: (dir: string) => void;
  deleteFile: (path: string) => void;
}

/** Where one invocation's structural artifacts live, derived once from its {@link ArtifactIdentity}. */
export interface StructuralPaths {
  /** `<outputDir>/structural/<module>/<slug>.nt` — the last-green baseline. */
  readonly lastGreen: string;
  /** `<approvedDir>/<module>/<slug>.approved.nt`, when approval mode is on. */
  readonly approved?: string;
  /** The `.received.nt` sibling of {@link approved}. */
  readonly received?: string;
  /** The `.incomplete.nt` sibling of {@link approved}, written instead on a lossy run. */
  readonly incomplete?: string;
}

/** Structural artifact paths for one invocation under `outputDir`/`approvedDir`. */
export function structuralPaths(
  identity: ArtifactIdentity,
  outputDir: string,
  approvedDir: string | undefined,
): StructuralPaths {
  const slug = fileSlug(identity);
  const moduleDir = moduleDirectorySlug(identity);
  const lastGreen = `${outputDir}/structural/${moduleDir}/${slug}.nt`;
  if (approvedDir === undefined) return { lastGreen };
  const approved = `${approvedDir}/${moduleDir}/${slug}.approved.nt`;
  return {
    lastGreen,
    approved,
    received: `${approvedDir}/${moduleDir}/${slug}.received.nt`,
    incomplete: `${approvedDir}/${moduleDir}/${slug}.incomplete.nt`,
  };
}

/**
 * Everything one test's structural write produced: the delta against the last-green baseline (for
 * the console footer and a failure's own diff), and — only when approval mode is on — the approval
 * outcome (for a readable rejection message).
 */
export interface StructuralWriteResult {
  readonly delta: ScenarioDelta;
  readonly approval?: ApprovalTraceOutcome;
}

function writeApprovalReceipt(
  outcome: ApprovalTraceOutcome,
  paths: StructuralPaths,
  io: StructuralIo,
): void {
  const target = outcome.kind === "lossy-changed" ? paths.incomplete : paths.received;
  if (target === undefined || !("received" in outcome)) return;
  mkdirFor(target, io);
  io.writeFile(target, outcome.received);
}

function clearStaleReceipt(paths: StructuralPaths, io: StructuralIo): void {
  if (paths.received !== undefined) io.deleteFile(paths.received);
  if (paths.incomplete !== undefined) io.deleteFile(paths.incomplete);
}

/** `true` for an outcome that must fail the test — everything except a clean or lossy match. */
export function approvalRejected(outcome: ApprovalTraceOutcome | undefined): boolean {
  if (outcome === undefined) return false;
  return outcome.kind !== "match" && outcome.kind !== "lossy-match";
}

function mkdirFor(path: string, io: StructuralIo): void {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash > 0) io.mkdir(path.slice(0, lastSlash));
}

/**
 * Runs approval-mode verification, when an approved-trace path is configured, and reports what it
 * found. Never called for an already-failed test (Java parity: "failing tests are never verified" —
 * their structure is mid-flight and must not churn the received files).
 */
function verifyApproval(
  current: string,
  paths: StructuralPaths,
  lossNote: string | undefined,
  io: StructuralIo,
): ApprovalTraceOutcome | undefined {
  if (paths.approved === undefined) return undefined;
  const outcome = evaluateApprovalTrace(io.readFile(paths.approved), current, lossNote);
  if (approvalRejected(outcome)) {
    writeApprovalReceipt(outcome, paths, io);
  } else {
    clearStaleReceipt(paths, io);
  }
  return outcome;
}

/**
 * The full per-test structural write, mirroring Java `TraceTestSupport.writeStructuralArtifact` +
 * `NarrativeApproval.verify`: render the current structure, compare it to the last-green baseline
 * for the delta every caller reports, run approval-mode verification when configured, and — only on
 * a fully green verdict (the test itself passed AND, when approval mode is on, its structure was
 * approved) — promote the current render to the new last-green baseline.
 *
 * @param testFailed whether the test body itself already failed; approval is skipped and the
 * last-green baseline is left untouched either way.
 * @param lossNote when the capture was incomplete, a human-readable description of what was lost
 * (see `approvalLossNote`) — switches approval comparison to subsequence containment.
 */
export function writeStructuralOutput(
  tree: TraceTree,
  scenario: string,
  paths: StructuralPaths,
  testFailed: boolean,
  lossNote: string | undefined,
  io: StructuralIo,
): StructuralWriteResult {
  const current = renderStructuralDocument(tree, scenario);
  const delta = scenarioDelta(scenario, io.readFile(paths.lastGreen), current);
  const approval = testFailed ? undefined : verifyApproval(current, paths, lossNote, io);
  if (!testFailed && !approvalRejected(approval)) {
    mkdirFor(paths.lastGreen, io);
    io.writeFile(paths.lastGreen, current);
  }
  return approval === undefined ? { delta } : { delta, approval };
}
