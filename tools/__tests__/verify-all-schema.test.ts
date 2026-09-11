// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { CategoryResult, VerificationRun } from "../verify-all-schema.js";
import {
  overallStatus,
  readVerificationJson,
  renderMarkdown,
  writeVerificationJson,
} from "../verify-all-schema.js";

function row(status: CategoryResult["status"]): CategoryResult {
  return { category: "lint", tool: "Biome", status, metrics: {}, durationSeconds: 1, note: null };
}

function run(categories: readonly CategoryResult[]): VerificationRun {
  return {
    runtime: "typescript",
    version: "0.1.1",
    commit: "abc1234",
    host: "test-x64",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    categories,
  };
}

describe("overallStatus", () => {
  test("passed when no row failed", () => {
    expect(overallStatus([row("passed"), row("skipped"), row("not-implemented")])).toBe("passed");
  });

  test("failed when at least one row failed", () => {
    expect(overallStatus([row("passed"), row("failed")])).toBe("failed");
  });

  test("skipped and not-implemented never taint the overall verdict", () => {
    expect(overallStatus([row("skipped"), row("not-implemented")])).toBe("passed");
  });
});

describe("writeVerificationJson / readVerificationJson / renderMarkdown", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-verify-all-schema-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("round-trips every field, snake_cased, with no missing keys", () => {
    const path = join(dir, "2026-01-01.json");
    writeVerificationJson(run([row("passed")]), path);
    const parsed = readVerificationJson(path);

    expect(parsed.runtime).toBe("typescript");
    expect(parsed.overall_status).toBe("passed");
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.categories[0]).toEqual({
      category: "lint",
      tool: "Biome",
      status: "passed",
      metrics: {},
      duration_seconds: 1,
      note: null,
    });
  });

  test("renderMarkdown reads the file back rather than trusting in-memory state", () => {
    const path = join(dir, "2026-01-02.json");
    writeVerificationJson(run([row("failed")]), path);
    const rendered = renderMarkdown(path);

    expect(rendered).toContain("overall status: failed");
    expect(rendered).toContain("**FAILED**");
  });

  test("an empty metrics object renders as an em dash, not an empty string", () => {
    const path = join(dir, "2026-01-03.json");
    writeVerificationJson(run([row("not-implemented")]), path);

    expect(renderMarkdown(path)).toContain("| — |");
  });
});
