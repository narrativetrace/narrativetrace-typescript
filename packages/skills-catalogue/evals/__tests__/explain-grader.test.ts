// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync, spawn } from "node:child_process";
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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The narrativetrace-explain grader, rehearsed on solved, untouched and near-miss trials BEFORE any
 * trial is spent — and kept, so it stays rehearsed. Each row runs a case's real `verify.sh` in a
 * scaffolded copy of `existing-service-checkout` (one that really ran its flow test once, for the
 * rows that need a trace on disk) over a transcript written the way the runner writes one, and
 * asserts the grader's REASON, never only its exit code.
 */

const EVALS = join(import.meta.dirname, "..");
const PACKAGE = join(EVALS, "..");
const REPO = join(PACKAGE, "..", "..");
const BUDGET_MS = 180_000;
const FLOW_NT = "narrativetrace-output/structural/checkout-flow/customer_checks_out.nt";

let cache: string;
let root: string;
let project: string;
let transcript: string;

function link(target: string, at: string): void {
  mkdirSync(join(at, ".."), { recursive: true });
  symlinkSync(target, at);
}

/** What `checkout-install` leaves: the fixture, this checkout's packages resolvable, the kit installed. */
function scaffold(into: string): void {
  cpSync(join(EVALS, "fixtures", "existing-service-checkout"), into, { recursive: true });
  const modules = join(into, "node_modules");
  link(join(PACKAGE, "node_modules", "@narrativetrace"), join(modules, "@narrativetrace"));
  link(join(REPO, "node_modules", "vitest"), join(modules, "vitest"));
  link(join(REPO, "node_modules", ".bin", "vitest"), join(modules, ".bin", "vitest"));
  const kit = join(modules, "@acme", "checkout-kit");
  mkdirSync(kit, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    join(into, "vendor", "acme-checkout-kit-2.4.1.tgz"),
    "-C",
    kit,
    "--strip-components=1",
  ]);
}

function runFlowTest(into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["vitest", "run", "test/checkout-flow.test.js"], { cwd: into });
    child.on("close", (status) => (status === 0 ? resolve() : reject(new Error("flow test red"))));
  });
}

beforeAll(async () => {
  cache = mkdtempSync(join(tmpdir(), "nt-explain-grader-cache-"));
  scaffold(join(cache, "clean"));
  scaffold(join(cache, "traced"));
  await runFlowTest(join(cache, "traced"));
}, BUDGET_MS);

afterAll(() => rmSync(cache, { recursive: true, force: true }));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nt-explain-grader-"));
  project = join(root, "project");
  transcript = join(root, "transcript.jsonl");
  return () => rmSync(root, { recursive: true, force: true });
});

const restore = (state: "clean" | "traced"): void =>
  cpSync(join(cache, state), project, { recursive: true, verbatimSymlinks: true });
const read = (relative: string): string => readFileSync(join(project, relative), "utf8");
const write = (relative: string, text: string): void =>
  writeFileSync(join(project, relative), text);

type Line = Record<string, unknown>;
const turn = (n: number, text: string): Line => ({ nt_turn: n, role: "user", text });
const says = (text: string): Line => ({
  type: "assistant",
  message: { content: [{ type: "text", text }] },
});
const tool = (name: string, input: Record<string, unknown>): Line => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", name, input }] },
});
const bash = (command: string): Line => tool("Bash", { command });
const skill = (name: string): Line => tool("Skill", { skill: name });
const sees = (content: string): Line => ({
  type: "user",
  message: { content: [{ type: "tool_result", content }] },
});

function grade(
  testCase: string,
  lines: readonly Line[],
): Promise<{ status: number | null; out: string }> {
  writeFileSync(transcript, lines.map((line) => JSON.stringify(line)).join("\n"));
  const verify = join(EVALS, "narrativetrace-explain", testCase, "graders", "verify.sh");
  return new Promise((resolve) => {
    const env = { ...process.env, NARRATIVETRACE_TRANSCRIPT: transcript };
    const child = spawn("sh", [verify], { cwd: project, env });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (status) => resolve({ status, out }));
  });
}

const ASK = "show me what this application does when an order is placed";
const EXPLANATION =
  "InvoiceService.issueInvoice #1.1, then PaymentGateway.authorize #1.2, then CardSettlement.settle #1.3 whose " +
  "PaymentGateway.confirm #1.3.1 captures it. No listener ran. The kit's own code was not observed: no span covers it.";

/** The explain flow of a solved trial: invoke, run, read the .nt, then explain citing its ids. */
function solved(
  overrides: { skipSkill?: boolean; skipRead?: boolean; answer?: string } = {},
): Line[] {
  return [
    turn(1, ASK),
    ...(overrides.skipSkill ? [] : [skill("narrativetrace-explain")]),
    bash("npx vitest run test/checkout-flow.test.js"),
    ...(overrides.skipRead ? [] : [bash(`cat ${FLOW_NT}`), sees(read(FLOW_NT))]),
    says(overrides.answer ?? EXPLANATION),
  ];
}

describe("the explain grader — an unfamiliar flow", () => {
  it(
    "passes a solved trial: invoked, traced, read before the answer, ids cited, code untouched",
    async () => {
      restore("traced");
      const result = await grade("explain-an-unfamiliar-flow", solved());
      expect(result.out).toContain("PASS the Skill tool invoked narrativetrace-explain");
      expect(result.out).toContain("PASS a structural trace reached the agent before its answer");
      expect(result.out).toContain(
        "PASS the answer cites a span id the trace it produced actually has",
      );
      expect(result.out).toContain("note the flow's calls are named in the order they ran: true");
      expect(result.out).toContain("note the answer names what was not observed: true");
      expect(result.status).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "grades the happy-path case with the same grader",
    async () => {
      restore("traced");
      expect((await grade("happy-path", solved())).status).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "fails a trial that never invoked the skill, and still reports why",
    async () => {
      restore("traced");
      const result = await grade("explain-an-unfamiliar-flow", solved({ skipSkill: true }));
      expect(result.out).toMatch(
        /FAIL the Skill tool invoked narrativetrace-explain — it never did/,
      );
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails an answer written from the source: no run, so no trace",
    async () => {
      restore("clean");
      const result = await grade("explain-an-unfamiliar-flow", [
        turn(1, ASK),
        skill("narrativetrace-explain"),
        says(EXPLANATION),
      ]);
      expect(result.out).toMatch(/FAIL the run left a structural trace in the project/);
      expect(result.out).toMatch(/FAIL a structural trace reached the agent before its answer/);
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails a run whose trace nobody read",
    async () => {
      restore("traced");
      const result = await grade("explain-an-unfamiliar-flow", solved({ skipRead: true }));
      expect(result.out).toMatch(
        /FAIL a structural trace reached the agent before its answer — no structural/,
      );
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails an answer citing an id that is in no trace",
    async () => {
      restore("traced");
      const answer = "PaymentGateway.confirm #9.9.9 settled it; the kit was not observed.";
      const result = await grade("explain-an-unfamiliar-flow", solved({ answer }));
      expect(result.out).toMatch(
        /FAIL the answer cites a span id the trace it produced actually has/,
      );
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails an explanation made by rewriting the service",
    async () => {
      restore("traced");
      write("src/checkout-service.js", `${read("src/checkout-service.js")}\n// explained\n`);
      const result = await grade("explain-an-unfamiliar-flow", solved());
      expect(result.out).toMatch(
        /FAIL the production code and the build were left alone — changed: src\/checkout-service.js/,
      );
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails an explanation made by adding a dependency",
    async () => {
      restore("traced");
      write(
        "package.json",
        read("package.json").replace(
          '"vitest": "^3.2.0"',
          '"vitest": "^3.2.0",\n    "left-pad": "1.3.0"',
        ),
      );
      const result = await grade("explain-an-unfamiliar-flow", solved());
      expect(result.out).toMatch(
        /FAIL the production code and the build were left alone — changed:.*package.json/,
      );
    },
    BUDGET_MS,
  );

  it(
    "fails the whole combination: a skipped skill AND a rewritten service report both reasons",
    async () => {
      restore("traced");
      write("src/late-fees.js", "export const feeFor = () => 0;\n");
      const result = await grade("explain-an-unfamiliar-flow", solved({ skipSkill: true }));
      expect(result.out).toMatch(/FAIL the Skill tool/);
      expect(result.out).toMatch(/FAIL the production code/);
    },
    BUDGET_MS,
  );
});

const FEE_ANSWER =
  "Reading the source: feeFor in src/late-fees.js is a pure function — 150 cents per day late, and zero when it is not late.";

describe("the explain grader — the pure-function control", () => {
  const control = (answer: string, extra: Line[] = []): Line[] => [
    turn(1, "Explain what feeFor does."),
    skill("narrativetrace-explain"),
    ...extra,
    says(answer),
  ];

  it(
    "passes a solved trial: answered from the source, nothing installed, run or traced",
    async () => {
      restore("clean");
      const result = await grade("pure-function-control", control(FEE_ANSWER));
      expect(result.out).toContain("PASS nothing was run");
      expect(result.out).toContain("PASS nothing was traced");
      expect(result.out).toContain("note the reply says why it is not tracing: true");
      expect(result.status).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "fails a run of the suite 'to be sure'",
    async () => {
      restore("clean");
      const result = await grade(
        "pure-function-control",
        control(FEE_ANSWER, [bash("npx vitest run")]),
      );
      expect(result.out).toMatch(/FAIL nothing was run — the tests ran at event/);
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails a trace of a pure function, on disk and in the transcript",
    async () => {
      restore("traced");
      const seen = [bash(`cat ${FLOW_NT}`), sees(read(FLOW_NT))];
      const result = await grade("pure-function-control", control(FEE_ANSWER, seen));
      expect(result.out).toMatch(/FAIL nothing was traced/);
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails an answer that describes the method without its numbers",
    async () => {
      restore("clean");
      const result = await grade(
        "pure-function-control",
        control("feeFor charges a fee when an invoice is late."),
      );
      expect(result.out).toMatch(
        /FAIL the answer comes from the source: the method, the rate and the not-late case/,
      );
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails a dependency added to the build, and a changed source",
    async () => {
      restore("clean");
      write(
        "package.json",
        read("package.json").replace('"vitest": "^3.2.0"', '"vitest": "^4.0.0"'),
      );
      write("src/late-fees.js", `${read("src/late-fees.js")}// touched\n`);
      const result = await grade("pure-function-control", control(FEE_ANSWER));
      expect(result.out).toMatch(
        /FAIL no dependency was added and no build file changed — changed: package.json/,
      );
      expect(result.out).toMatch(
        /FAIL the project's sources were left alone — changed: src\/late-fees.js/,
      );
    },
    BUDGET_MS,
  );
});
