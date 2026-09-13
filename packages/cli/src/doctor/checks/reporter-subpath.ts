// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "config.reporter-subpath";
const VITEST_CONFIG_NAME = /(^|\/)vitest\.config\.[cm]?[jt]s$/;
const REPORTER_NAMES = /\b(ClaritySuiteReporter|GlossarySuiteReporter|StructuralSuiteReporter)\b/;
const ROOT_IMPORT = /from\s+["']@narrativetrace\/vitest["']/;
const SUBPATH_IMPORT = /from\s+["']@narrativetrace\/vitest\/reporters["']/;

function importsFromRoot(content: string): boolean {
  return REPORTER_NAMES.test(content) && ROOT_IMPORT.test(content) && !SUBPATH_IMPORT.test(content);
}

/**
 * `ClaritySuiteReporter`/`GlossarySuiteReporter`/`StructuralSuiteReporter` must be imported from
 * the `/reporters` subpath — importing them from the package root also loads `vitest` itself,
 * which crashes config loading on every version (llms.txt "Before you start").
 */
export const checkReporterSubpath: DoctorCheck = (snapshot) => {
  const configs = [...snapshot.sourceFiles].filter(([path]) => VITEST_CONFIG_NAME.test(path));
  const offender = configs.find(([, content]) => importsFromRoot(content));
  if (offender) {
    const [path] = offender;
    return fail(
      ID,
      `${path} imports a NarrativeTrace vitest reporter from the package root, not the /reporters subpath`,
      'Import reporters from "@narrativetrace/vitest/reporters" — importing from the package root also loads vitest itself and crashes config loading.',
      DOC.vitestConfiguration,
    );
  }
  const message =
    configs.length === 0
      ? "no vitest.config found — nothing to check"
      : "every registered reporter is imported from the /reporters subpath";
  return pass(ID, message, DOC.vitestConfiguration);
};
