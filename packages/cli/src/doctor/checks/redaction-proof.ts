// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "trap.redaction-proof";
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const REDACTED_ASSERTION = /\[REDACTED\]/;

/**
 * Redaction is a security property; the trap named across every study is trusting it by
 * inspection rather than proving it — importing the redaction primitives and never asserting on
 * their output. This looks for a test that actually asserts the literal `[REDACTED]` marker.
 */
export const checkRedactionProof: DoctorCheck = (snapshot) => {
  const testFiles = [...snapshot.sourceFiles].filter(([path]) => TEST_FILE.test(path));
  const proven = testFiles.some(([, content]) => REDACTED_ASSERTION.test(content));
  if (proven) {
    return pass(
      ID,
      "a test asserts [REDACTED] for a deny-listed parameter name",
      DOC.redactionSurfaceBySurface,
    );
  }
  return fail(
    ID,
    "no test asserts [REDACTED] — redaction is unproven",
    'Render a call with a deny-listed parameter name (e.g. "password", "token") in a test and assert the output contains "[REDACTED]" — and that a neighboring, non-sensitive value is still present, so an over-broad redaction also fails.',
    DOC.redactionSurfaceBySurface,
  );
};
