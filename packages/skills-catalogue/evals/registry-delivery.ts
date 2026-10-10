// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { join } from "node:path";
import { preStepCommands, type RegistryPreStep } from "./registry-pre-step.js";

/**
 * INTENT: how the case a runner is driving got its skill pages when a registry delivered them. One
 * value answers both questions that follow from it: what runs before the agent starts, and where
 * the tree that delivery reads lives. (Which configuration directory every command uses is no longer
 * a registry question: every trial runs against its own — `trial-environment.ts`.)
 *
 * A pre-step and the work directory it runs in, together or not at all: a step without a work
 * directory would run a vendor tool against the ambient configuration, and a work directory without
 * a step would isolate a trial that installs nothing. `undefined` is the ordinary case.
 *
 * @llmNote This port's harness copies NONE of its own rendered pages into a scratch project for ANY
 * case, so there is no "skip the copy" switch here. A non-registry case that needs the pages
 * declares the `checkout-install` setup, which runs our own installer — and the runner refuses a
 * case declaring both, because a registry case whose pages our installer overwrote answers its own
 * question.
 */
export interface RegistryDelivery {
  /** Which documented registry puts this case's pages in place. */
  readonly preStep: RegistryPreStep;
  /**
   * A directory the trial owns and the runner deletes — the isolated vendor configuration and the
   * staged snapshot both live inside it, never inside the graded project.
   */
  readonly workDir: string;
}

/**
 * The tree the registry tool reads, inside the work directory and so BESIDE the graded project. A
 * staged tree inside the project would be a second copy of the pages, in a path the registry tool
 * scans and the grader would then find.
 */
export function stagedSnapshotIn(workDir: string): string {
  return join(workDir, "staged");
}

/** Everything that runs before the agent starts, in order. */
export function deliveryCommands(
  delivery: RegistryDelivery,
  repoRoot: string,
): readonly (readonly string[])[] {
  return preStepCommands(delivery.preStep, repoRoot, stagedSnapshotIn(delivery.workDir));
}
