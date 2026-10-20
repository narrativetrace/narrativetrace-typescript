// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { parseExclude, SHIPPED_EXCLUDE } from "../packages/core/src/index.js";
import { snapshot } from "../packages/tooling/__tests__/fixture.js";
import {
  checkInstrumentationExclusions,
  SHIPPED_DEFAULT,
} from "../packages/tooling/src/doctor/checks/instrumentation-exclusions.js";

/**
 * The doctor imports nothing (not even core), so it carries its own copy of the shipped list and of
 * the exclude grammar. These tests are what keeps the copy honest: the runtime's constant and parser
 * are the source, the doctor must agree with them on every input.
 */
describe("the doctor's exclude copy agrees with the runtime's", () => {
  test("the shipped default is the runtime's, member for member", () => {
    expect(SHIPPED_DEFAULT).toEqual(SHIPPED_EXCLUDE.map((member) => member.prefix));
  });

  const corpus = [
    "",
    "a",
    "a;b",
    "a,b",
    " a ; b ",
    "a.*",
    "a.**",
    "a.",
    "a/",
    "a/*",
    "a;;b",
    "a;a",
    "a,a.*",
    ".*",
    ";",
    "  ",
    "acme.billing;acme.billingExtra",
  ];

  for (const raw of corpus) {
    test(`agrees on ${JSON.stringify(raw)}`, () => {
      const finding = checkInstrumentationExclusions(
        snapshot({ env: { NARRATIVETRACE_EXCLUDE: raw } }),
      );
      let accepted: readonly string[] | undefined;
      try {
        accepted = parseExclude(raw);
      } catch {
        accepted = undefined;
      }
      expect(finding.status).toBe(accepted === undefined ? "fail" : "pass");
      if (accepted !== undefined && accepted.length > 0) {
        expect(finding.message).toContain(accepted.join(", "));
      }
    });
  }
});
