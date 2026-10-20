// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { caseFixtureSpec } from "../runner.js";

const EVALS_DIR = join(import.meta.dirname, "..");
const FIXTURE_LINE = /^\*\*Fixture:\*\*\s+`([^`]+)`/m;
const deps = { exists: existsSync, readFile: (path: string) => readFileSync(path, "utf-8") };

interface DocumentedCase {
  readonly skill: string;
  readonly caseName: string;
  readonly documented: string;
}

function directories(parent: string): string[] {
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** Every case directory whose `prompt.md` is a case document naming its fixture. */
function documentedCases(): DocumentedCase[] {
  return directories(EVALS_DIR).flatMap((skill) =>
    directories(join(EVALS_DIR, skill)).flatMap((caseName) => {
      const prompt = join(EVALS_DIR, skill, caseName, "prompt.md");
      const documented = existsSync(prompt)
        ? FIXTURE_LINE.exec(readFileSync(prompt, "utf-8"))
        : null;
      return documented?.[1] === undefined ? [] : [{ skill, caseName, documented: documented[1] }];
    }),
  );
}

describe("a case document's fixture is the fixture the runner resolves", () => {
  it("finds the case documents this test reads", () => {
    expect(documentedCases().length).toBeGreaterThan(2);
  });

  it.each(documentedCases())("$skill/$caseName runs on the fixture its document names", ({
    skill,
    caseName,
    documented,
  }) => {
    expect(caseFixtureSpec(EVALS_DIR, skill, caseName, deps).relativePath).toBe(documented);
  });
});
