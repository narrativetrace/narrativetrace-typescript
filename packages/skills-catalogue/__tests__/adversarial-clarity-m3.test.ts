// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ADD_NARRATIVETRACE_CLARITY } from "../src/catalogue/add-narrativetrace-clarity.js";
import {
  GATE_SCRIPT_PRESENT,
  REPORTER_REGISTERED,
  RESULTS_FRESH_AND_NONEMPTY,
  RESULTS_PATH,
  TEST_CAPTURES_CALLS,
  VITEST_DECLARED,
} from "../src/catalogue/clarity-commands.js";
import { catalogueVocabularyViolations, citationViolations } from "../src/lints.js";
import { renderClaudeSkill } from "../src/render/claude.js";
import { descriptionFitsBudget, stepsWithoutVerify } from "../src/skill.js";
import { REPO_ROOT } from "./repo-root.js";

// Adversarial pass over the clarity skill's verify one-liners: each runs as a real shell command in
// a scratch project, against near-miss projects that must FAIL and a good one that must PASS.

const MINUTE = 60_000;
const created: string[] = [];

/** Exit status of `command` run by the shell in `cwd`; 0 on success. */
function exitStatus(command: string, cwd: string): number {
  try {
    execFileSync(command, { shell: true, cwd, stdio: "ignore" });
    return 0;
  } catch (error) {
    return (error as { status?: number | null }).status ?? 1;
  }
}

function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "adv-clarity-m3-"));
  created.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

function packageJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ name: "consumer", version: "0.0.0", ...fields });
}

function resultsFile(scenarios: unknown): string {
  return JSON.stringify({ scenarios });
}

const GOOD_SCENARIO = {
  name: "a customer places an order",
  overallScore: 0.9,
  issues: [],
};

function ageFile(dir: string, rel: string, minutesAgo: number): void {
  const when = new Date(Date.now() - minutesAgo * MINUTE);
  utimesSync(join(dir, rel), when, when);
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("VITEST_DECLARED (adversarial)", () => {
  it("passes when vitest is declared in devDependencies", () => {
    const dir = makeProject({
      "package.json": packageJson({ devDependencies: { vitest: "^3.2.0" } }),
    });
    expect(exitStatus(VITEST_DECLARED, dir)).toBe(0);
  });

  it("passes when vitest is declared in dependencies", () => {
    const dir = makeProject({
      "package.json": packageJson({ dependencies: { vitest: "^3.2.0" } }),
    });
    expect(exitStatus(VITEST_DECLARED, dir)).toBe(0);
  });

  it("fails when vitest is only a peer dependency, which the project does not install itself", () => {
    const dir = makeProject({
      "package.json": packageJson({ peerDependencies: { vitest: "^3.2.0" } }),
    });
    expect(exitStatus(VITEST_DECLARED, dir)).toBe(1);
  });

  it("fails for a sibling package whose name only starts with vitest", () => {
    const dir = makeProject({
      "package.json": packageJson({ devDependencies: { "vitest-ui-kit": "1.0.0" } }),
    });
    expect(exitStatus(VITEST_DECLARED, dir)).toBe(1);
  });

  it("fails when there is no package.json at all", () => {
    const dir = makeProject({});
    expect(exitStatus(VITEST_DECLARED, dir)).not.toBe(0);
  });
});

describe("REPORTER_REGISTERED (adversarial)", () => {
  const SUBPATH_IMPORT =
    'import { ClaritySuiteReporter } from "@narrativetrace/vitest/reporters";\n';

  it("passes for the subpath import with the reporter instantiated in a .mjs config", () => {
    const dir = makeProject({
      "vitest.config.mjs": `${SUBPATH_IMPORT}export default { test: { reporters: [new ClaritySuiteReporter()] } };\n`,
    });
    expect(exitStatus(REPORTER_REGISTERED, dir)).toBe(0);
  });

  it("fails when there is no vitest config at all", () => {
    const dir = makeProject({ "package.json": packageJson({}) });
    expect(exitStatus(REPORTER_REGISTERED, dir)).toBe(1);
  });

  it("fails when the config imports the reporter from the package root, which the skill forbids", () => {
    const dir = makeProject({
      "vitest.config.js":
        'import { ClaritySuiteReporter } from "@narrativetrace/vitest";\nexport default { test: { reporters: [new ClaritySuiteReporter()] } };\n',
    });
    expect(exitStatus(REPORTER_REGISTERED, dir)).toBe(1);
  });

  // Found by the adversarial pass, fixed: the import is real but the reporter is never put in `reporters`, and the regex still
  // passes because it only looks for the constructor's text anywhere in the file.
  it("fails when the reporter is imported and only named in a comment, never registered", () => {
    const dir = makeProject({
      "vitest.config.js": `${SUBPATH_IMPORT}// TODO: new ClaritySuiteReporter()\nexport default { test: { reporters: ["default"] } };\n`,
    });
    expect(exitStatus(REPORTER_REGISTERED, dir)).toBe(1);
  });

  // Found by the adversarial pass, fixed: the check is a regex over the whole file text, so a comment that names the subpath and
  // the constructor passes even though no reporter is registered and Vitest writes no results file.
  it("fails when the subpath and the constructor appear only inside comments", () => {
    const dir = makeProject({
      "vitest.config.js": `// import { ClaritySuiteReporter } from "@narrativetrace/vitest/reporters";\n// reporters: [new ClaritySuiteReporter()]\nexport default { test: { reporters: ["default"] } };\n`,
    });
    expect(exitStatus(REPORTER_REGISTERED, dir)).toBe(1);
  });
});

describe("TEST_CAPTURES_CALLS (adversarial)", () => {
  const CAPTURING_TEST = 'import { createNarrativeTest } from "@narrativetrace/vitest";\n';

  it("passes for a test file under src that uses createNarrativeTest", () => {
    const dir = makeProject({ "src/orders/order.test.ts": CAPTURING_TEST });
    expect(exitStatus(TEST_CAPTURES_CALLS, dir)).toBe(0);
  });

  it("fails when the only capturing file lives inside node_modules", () => {
    const dir = makeProject({ "node_modules/some-lib/order.test.js": CAPTURING_TEST });
    expect(exitStatus(TEST_CAPTURES_CALLS, dir)).toBe(1);
  });

  it("fails for a file named like a test but without the .test. delimiter", () => {
    const dir = makeProject({ "test/order-test.js": CAPTURING_TEST });
    expect(exitStatus(TEST_CAPTURES_CALLS, dir)).toBe(1);
  });

  it("fails for a backup copy whose name merely contains .test.js", () => {
    const dir = makeProject({ "test/order.test.js.bak": CAPTURING_TEST });
    expect(exitStatus(TEST_CAPTURES_CALLS, dir)).toBe(1);
  });

  it("fails when the helper name appears in a file that is not a test", () => {
    const dir = makeProject({ "test/helpers.js": CAPTURING_TEST });
    expect(exitStatus(TEST_CAPTURES_CALLS, dir)).toBe(1);
  });

  // Found by the adversarial pass, fixed: Vitest's default include is **/*.{test,spec}.?(c|m)[jt]s?(x), so a spec file that
  // captures calls runs and records scenarios, yet the verify demands the literal ".test." infix.
  it("passes for a .spec file that captures calls, because Vitest runs .spec files too", () => {
    const dir = makeProject({ "test/order.spec.ts": CAPTURING_TEST });
    expect(exitStatus(TEST_CAPTURES_CALLS, dir)).toBe(0);
  });
});

describe("RESULTS_FRESH_AND_NONEMPTY (adversarial)", () => {
  function projectWithResults(body: string): string {
    return makeProject({ [RESULTS_PATH]: body });
  }

  it("passes for a fresh file with one scored scenario and an issues array", () => {
    const dir = projectWithResults(resultsFile([GOOD_SCENARIO]));
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).toBe(0);
  });

  it("passes at fourteen minutes old and fails at sixteen, around the fifteen-minute limit", () => {
    const young = projectWithResults(resultsFile([GOOD_SCENARIO]));
    ageFile(young, RESULTS_PATH, 14);
    const old = projectWithResults(resultsFile([GOOD_SCENARIO]));
    ageFile(old, RESULTS_PATH, 16);
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, young)).toBe(0);
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, old)).toBe(1);
  });

  it("fails for a file twenty minutes old even though its contents are well formed", () => {
    const dir = projectWithResults(resultsFile([GOOD_SCENARIO]));
    ageFile(dir, RESULTS_PATH, 20);
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).toBe(1);
  });

  it("fails when no results file exists, since a missing file is not a success", () => {
    const dir = makeProject({ "package.json": packageJson({}) });
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).not.toBe(0);
  });

  it("fails for an empty scenarios array", () => {
    const dir = projectWithResults(resultsFile([]));
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).toBe(1);
  });

  it("fails when a scenario is missing its issues array", () => {
    const dir = projectWithResults(resultsFile([{ name: "x", overallScore: 0.5 }]));
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).toBe(1);
  });

  it("fails when one of two scenarios is missing its issues array", () => {
    const dir = projectWithResults(resultsFile([GOOD_SCENARIO, { name: "y", overallScore: 0.4 }]));
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).toBe(1);
  });

  it("fails when overallScore is null rather than a number", () => {
    const dir = projectWithResults(resultsFile([{ ...GOOD_SCENARIO, overallScore: null }]));
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).toBe(1);
  });

  it("fails when scenarios is an object instead of an array", () => {
    const dir = projectWithResults(JSON.stringify({ scenarios: { a: GOOD_SCENARIO } }));
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).toBe(1);
  });

  it("fails for a file that is not JSON at all", () => {
    const dir = projectWithResults("not json");
    expect(exitStatus(RESULTS_FRESH_AND_NONEMPTY, dir)).not.toBe(0);
  });
});

describe("GATE_SCRIPT_PRESENT (adversarial)", () => {
  it("passes when the clarity script runs the narrativetrace-clarity bin", () => {
    const dir = makeProject({
      "package.json": packageJson({
        scripts: { clarity: "narrativetrace-clarity --input x.json" },
      }),
    });
    expect(exitStatus(GATE_SCRIPT_PRESENT, dir)).toBe(0);
  });

  it("fails when the clarity script is named but runs a different tool", () => {
    const dir = makeProject({
      "package.json": packageJson({ scripts: { clarity: "vitest run --reporter=clarity" } }),
    });
    expect(exitStatus(GATE_SCRIPT_PRESENT, dir)).toBe(1);
  });

  it("fails when the bin is run by some other script, not the clarity script", () => {
    const dir = makeProject({
      "package.json": packageJson({ scripts: { lint: "narrativetrace-clarity --input x.json" } }),
    });
    expect(exitStatus(GATE_SCRIPT_PRESENT, dir)).toBe(1);
  });

  it("fails when there are no scripts at all", () => {
    const dir = makeProject({ "package.json": packageJson({}) });
    expect(exitStatus(GATE_SCRIPT_PRESENT, dir)).toBe(1);
  });

  // Found by the adversarial pass, fixed: the check is a substring match, so a sibling bin name that merely begins with
  // "narrativetrace-clarity" (here a retired, different tool) satisfies the gate's presence check.
  it("fails for a sibling bin name that only shares the narrativetrace-clarity prefix", () => {
    const dir = makeProject({
      "package.json": packageJson({
        scripts: { clarity: "narrativetrace-clarity-legacy --check" },
      }),
    });
    expect(exitStatus(GATE_SCRIPT_PRESENT, dir)).toBe(1);
  });
});

describe("clarity skill lints and rendering (adversarial)", () => {
  it("has no closed-vocabulary violations in any of its commands", () => {
    expect(catalogueVocabularyViolations([ADD_NARRATIVETRACE_CLARITY])).toEqual([]);
  });

  it("cites no section mark and no external markdown filename in its rendered Claude page", () => {
    const rendered = renderClaudeSkill(ADD_NARRATIVETRACE_CLARITY, readRepoFile);
    expect(rendered).not.toContain("§");
    expect(rendered).not.toMatch(/\b[\w.-]+\.md\b/i);
  });

  it("flags an external markdown citation in prose", () => {
    const skill = { ...ADD_NARRATIVETRACE_CLARITY, whenToUse: "See DESIGN.md for detail." };
    expect(citationViolations(skill, new Set())).toHaveLength(1);
  });

  it("flags a section mark hidden inside a verify string, not only inside prose", () => {
    const step = {
      title: "Check",
      body: { kind: "commands" as const, commands: ["pnpm test"] },
      verify: "pnpm test § gate",
    };
    const skill = { ...ADD_NARRATIVETRACE_CLARITY, steps: [step] };
    expect(citationViolations(skill, new Set())).toHaveLength(1);
  });

  it("has every snippet path present on disk relative to the repository root", () => {
    const missing = ADD_NARRATIVETRACE_CLARITY.steps.flatMap((step) =>
      step.body.kind === "snippet" && !existsSync(join(REPO_ROOT, step.body.path))
        ? [step.body.path]
        : [],
    );
    expect(missing).toEqual([]);
  });

  it("has a description within the 1024-character budget", () => {
    expect(ADD_NARRATIVETRACE_CLARITY.description.length).toBeLessThanOrEqual(1024);
    expect(descriptionFitsBudget(ADD_NARRATIVETRACE_CLARITY)).toBe(true);
  });

  it("leaves a verify-less step only where its flag documents why it is judgmental", () => {
    const unflagged = ADD_NARRATIVETRACE_CLARITY.steps.filter(
      (step) => step.verify === undefined && !step.flag,
    );
    expect(stepsWithoutVerify(ADD_NARRATIVETRACE_CLARITY)).toHaveLength(1);
    expect(unflagged).toEqual([]);
  });
});

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
