// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cliPackageDirectory } from "../src/carrier-locator.js";

/**
 * `documentation/agent-skills.md` embeds a real `narrativetrace init --dry-run --json` preview
 * (docs-as-tests, `<!-- snippet: -->`, never a hand-typed example) — from the BUILT artifact, never
 * the loose TS source: an exploded/dev run stamps the carrier `unknown`, and a page must show a
 * reader what a reader will actually see. This test runs the real `dist/cli-bin.js` against a
 * fresh, empty directory outside every repo tree and writes the captured envelope to this
 * package's own gitignored output directory (mirrors `examples/sixty-seconds`'s own
 * `console-output.txt` capture), for `pnpm run snippet-check`/`snippet-sync` to compare/embed.
 */
describe("init preview snippet (agent-skills.md embed)", () => {
  it("captures a --dry-run --json run of the built CLI against an empty project", () => {
    const builtBin = join(cliPackageDirectory(), "dist", "cli-bin.js");
    expect(existsSync(builtBin)).toBe(true);

    const scratch = mkdtempSync(join(tmpdir(), "nt-init-preview-"));
    try {
      const stdout = execFileSync(process.execPath, [builtBin, "init", "--dry-run", "--json"], {
        cwd: scratch,
        encoding: "utf-8",
      });
      const plan = JSON.parse(stdout) as {
        carrier: string;
        actions: readonly unknown[];
        exitCode: number;
      };
      expect(plan.carrier).toMatch(/^@narrativetrace\/skills@/);
      expect(plan.actions.length).toBeGreaterThan(0);
      expect(plan.exitCode).toBe(0);

      const outputDir = join(cliPackageDirectory(), "narrativetrace-output");
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(
        join(outputDir, "init-preview.json"),
        `${JSON.stringify(plan, null, 2)}\n`,
        "utf-8",
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
