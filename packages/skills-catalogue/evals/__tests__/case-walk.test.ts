// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { everyCasePromptUnder, everyFileUnder } from "../case-walk.js";

describe("everyCasePromptUnder", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nt-case-walk-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function put(rel: string): void {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), "prompt");
  }

  it("returns the real case prompts and skips fixture artefacts and dangling links", () => {
    put("skill-a/case-1/prompt.md");
    put("skill-b/case-2/prompt.md");
    put("fixtures/x/node_modules/some-pkg/prompt.md");
    put("fixtures/x/narrativetrace-output/prompt.md");
    mkdirSync(join(root, "fixtures/x/node_modules/@scope"), { recursive: true });
    symlinkSync("../../../../nowhere", join(root, "fixtures/x/node_modules/@scope/pkg"));

    symlinkSync(join(root, "skill-a"), join(root, "fixtures/x/linked-skill"), "dir");

    expect(everyCasePromptUnder(root)).toEqual([
      "skill-a/case-1/prompt.md",
      "skill-b/case-2/prompt.md",
    ]);
  });
});

describe("everyFileUnder", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nt-file-walk-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function put(rel: string): void {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), "#!/bin/sh");
  }

  it("returns the real shell scripts and skips fixture artefacts and links", () => {
    put("skill-a/case-1/graders/verify.sh");
    put("skill-a/bounded.sh");
    put("skill-a/case-1/prompt.md");
    put("fixtures/x/node_modules/some-pkg/verify.sh");
    put("fixtures/x/.turbo/run.sh");
    symlinkSync(join(root, "skill-a"), join(root, "fixtures/x/linked-skill"), "dir");

    expect(everyFileUnder(root, (name) => name.endsWith(".sh"))).toEqual([
      "skill-a/bounded.sh",
      "skill-a/case-1/graders/verify.sh",
    ]);
  });
});
