// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCTOR_CHECKS, runDoctor } from "@narrativetrace/tooling";
import { describe, expect, it } from "vitest";
import { snapshot } from "./fixture.js";

/**
 * The README's check table is the doctor's documented-ids list: every check the registry runs has
 * a row, and no row names a check the registry does not run.
 */
describe("the README's check table", () => {
  const readme = readFileSync(join(import.meta.dirname, "..", "README.md"), "utf-8");
  const documented = [...readme.matchAll(/^\| `([a-z]+\.[a-z0-9-]+)` \|/gm)].map((m) => m[1]);
  const ids = runDoctor(snapshot()).findings.map((finding) => finding.id);

  it("has one row per check the doctor runs, in the doctor's order", () => {
    expect(ids).toHaveLength(DOCTOR_CHECKS.length);
    expect(documented).toEqual(ids);
  });
});
