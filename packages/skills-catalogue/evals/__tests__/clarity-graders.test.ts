// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The clarity case's grader, rehearsed on a solved tree, an untouched one and the near misses
 * BEFORE any trial is spent — and kept, so it stays rehearsed. Each row runs the case's real
 * `verify.sh` in a scaffolded project that really runs Vitest and the shipped `narrativetrace-clarity`
 * bin, and asserts the grader's REASON, never only its exit code.
 *
 * The scaffold stands in for what `checkout-install` leaves: the project's `node_modules` resolves
 * this checkout's own packages (through this package's devDependencies) and the repository's Vitest.
 */

const EVALS = join(import.meta.dirname, "..");
const PACKAGE = join(EVALS, "..");
const VERIFY = join(EVALS, "add-narrativetrace-clarity", "happy-path", "graders", "verify.sh");
const SOLVED = join(EVALS, "fixtures", "clarity-consumer-solved");
const START = join(EVALS, "fixtures", "clarity-consumer");
const BUDGET_MS = 120_000;

let root: string;
let project: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nt-clarity-graders-"));
  project = join(root, "project");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function link(target: string, at: string): void {
  mkdirSync(join(at, ".."), { recursive: true });
  symlinkSync(target, at);
}

/** A copy of `fixture` whose `node_modules` resolves vitest and this checkout's packages. */
function scaffold(fixture: string): void {
  cpSync(fixture, project, { recursive: true });
  rmSync(join(project, "node_modules"), { recursive: true, force: true });
  rmSync(join(project, "narrativetrace-output"), { recursive: true, force: true });
  const modules = join(project, "node_modules");
  const own = join(PACKAGE, "node_modules");
  link(join(own, "@narrativetrace"), join(modules, "@narrativetrace"));
  link(join(PACKAGE, "..", "..", "node_modules", "vitest"), join(modules, "vitest"));
  for (const bin of ["narrativetrace-clarity", "narrativetrace"]) {
    link(join(own, ".bin", bin), join(modules, ".bin", bin));
  }
  link(
    join(PACKAGE, "..", "..", "node_modules", ".bin", "vitest"),
    join(modules, ".bin", "vitest"),
  );
}

function write(relative: string, text: string): void {
  writeFileSync(join(project, relative), text);
}

function read(relative: string): string {
  return readFileSync(join(project, relative), "utf8");
}

function editScript(edit: (script: string) => string | undefined): void {
  const manifest = JSON.parse(read("package.json"));
  const script = edit(manifest.scripts.clarity);
  if (script === undefined) delete manifest.scripts.clarity;
  else manifest.scripts.clarity = script;
  write("package.json", JSON.stringify(manifest, null, 2));
}

function grade(): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync("sh", [VERIFY], { cwd: project, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

function expectRefusal(reason: RegExp): void {
  const result = grade();
  expect(result.stderr).toMatch(reason);
  expect(result.status).not.toBe(0);
}

function fromSolved(relative: string): string {
  return readFileSync(join(SOLVED, relative), "utf8");
}

/** The unclear start fixture with everything a correct trial adds, but the names left unclear. */
function wireTheStartFixture(): void {
  scaffold(START);
  write("vitest.config.js", fromSolved("vitest.config.js"));
  const manifest = JSON.parse(read("package.json"));
  manifest.scripts.clarity = JSON.parse(fromSolved("package.json")).scripts.clarity;
  write("package.json", JSON.stringify(manifest, null, 2));
}

describe("the clarity gate grader", () => {
  it(
    "passes a solved tree: reporter wired, names clear, the gate a script, the gate clean",
    () => {
      scaffold(SOLVED);
      const result = grade();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/clarity gate: wired, scripted and clean/);
    },
    BUDGET_MS,
  );

  it("refuses the untouched start fixture first for the reporter nobody registered", () => {
    scaffold(START);
    expectRefusal(/clarity\.reporter-not-registered/);
  });

  it("refuses a reporter imported from the package root, which crashes the config", () => {
    scaffold(SOLVED);
    write(
      "vitest.config.js",
      read("vitest.config.js").replace(
        "@narrativetrace/vitest/reporters",
        "@narrativetrace/vitest",
      ),
    );
    expectRefusal(/clarity\.reporter-from-package-root/);
  });

  it("refuses a project whose test no longer traces a call", () => {
    scaffold(SOLVED);
    write("test/order-placer.test.js", 'import { test } from "vitest";\ntest("x", () => {});\n');
    expectRefusal(/clarity\.no-traced-test/);
  });

  it("refuses a gate that was never made a package script", () => {
    scaffold(SOLVED);
    editScript(() => undefined);
    expectRefusal(/clarity\.no-gate-script/);
  });

  it("refuses a gate weakened to advisory with --warn-only", () => {
    scaffold(SOLVED);
    editScript((script) => `${script} --warn-only`);
    expectRefusal(/clarity\.gate-weakened/);
  });

  it("refuses a gate whose minimum score was lowered below what was asked", () => {
    scaffold(SOLVED);
    editScript((script) => script.replace("--min-score 0.8", "--min-score 0.5"));
    expectRefusal(/clarity\.gate-weakened/);
  });

  it("refuses a gate with no minimum score at all", () => {
    scaffold(SOLVED);
    editScript((script) => script.replace("--min-score 0.8", ""));
    expectRefusal(/clarity\.gate-weakened/);
  });

  it(
    "refuses a wired and scripted project whose names are still unclear, for the gate itself",
    () => {
      wireTheStartFixture();
      expectRefusal(/clarity\.gate-failed/);
    },
    BUDGET_MS,
  );

  it(
    "refuses a reporter that writes its results where the gate does not look",
    () => {
      scaffold(SOLVED);
      write(
        "vitest.config.js",
        read("vitest.config.js").replace(
          "new ClaritySuiteReporter()",
          'new ClaritySuiteReporter({ outputDir: "elsewhere" })',
        ),
      );
      expectRefusal(/clarity\.no-results/);
    },
    BUDGET_MS,
  );

  it(
    "refuses a suite the rename broke",
    () => {
      scaffold(SOLVED);
      write(
        "src/order-placer.js",
        "export class OrderPlacer { placeOrder() { return 'wrong'; } }\n",
      );
      expectRefusal(/clarity\.suite-red/);
    },
    BUDGET_MS,
  );
});
