// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { withoutComments } from "../../frameworks/source-text.js";
import type { DoctorSnapshot } from "../types.js";

const TEST_PATH = /(?:\.test\.|\.spec\.|(?:^|\/)__tests__\/)/;

/** One source file's path and its code with comments removed. */
export interface CodeFile {
  readonly path: string;
  readonly code: string;
}

/**
 * The project's application source — every source file that is not a test — with comments removed.
 *
 * @llmNote A test never reaches the platform or the OTel bridge, so a check about what a *consumer*
 * of the trace will read (a service name, a class name) judges application code only.
 */
export function applicationSource(snapshot: DoctorSnapshot): CodeFile[] {
  return [...snapshot.sourceFiles]
    .filter(([path]) => !TEST_PATH.test(path))
    .map(([path, content]) => ({ path, code: withoutComments(content) }));
}
