// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DEFAULT_OUTPUT_DIRECTORY } from "../init/project-state.js";

/**
 * Where the verb's two files land, relative to the project.
 *
 * INTENT: under the project's own output directory, which is gitignored by every project this tool
 * installs into and is the one place the repository's own tree-writes guard permits a test to write.
 * The directory is resolved from the same environment variable the doctor's snapshot builder reads,
 * so a project that moved its output has not moved only half of it.
 */

/** The environment variable a project overrides its output directory with. */
export const OUTPUT_DIRECTORY_ENV = "NARRATIVETRACE_OUTPUT_DIR";

/** The subdirectory the feedback verb owns. */
export const FEEDBACK_SUBDIRECTORY = "feedback";

/** The two files a cleared draft becomes. */
export interface FeedbackFiles {
  /** The directory both files land in, relative to the project. */
  readonly directory: string;
  /** The whole draft plus the privacy note: what the agent shows. */
  readonly draftFile: string;
  /** The report alone: what the user pastes into the form, or `gh` files with `--body-file`. */
  readonly bodyFile: string;
}

/**
 * The two paths, given the environment the run saw.
 *
 * @param env the process environment, as the doctor's snapshot builder reads it.
 */
export function feedbackFiles(env: Readonly<Record<string, string | undefined>>): FeedbackFiles {
  const output = env[OUTPUT_DIRECTORY_ENV] ?? DEFAULT_OUTPUT_DIRECTORY;
  const directory = `${output}/${FEEDBACK_SUBDIRECTORY}`;
  return {
    directory,
    draftFile: `${directory}/feedback-draft.md`,
    bodyFile: `${directory}/feedback-body.md`,
  };
}
