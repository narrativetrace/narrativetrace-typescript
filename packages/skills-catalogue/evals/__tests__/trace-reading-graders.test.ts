// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The narrativetrace-verify and narrativetrace-debug graders, rehearsed on solved, untouched and
 * near-miss trials BEFORE any trial is spent — and kept, so they stay rehearsed (Java cross-port
 * items 5 and 8). Each row runs a case's real `verify.sh` in a scaffolded project that really runs
 * Vitest and the approve verb, over a transcript written the way the runner writes one (turn
 * markers and stream-json records), and asserts the grader's REASON, never only its exit code.
 */

const EVALS = join(import.meta.dirname, "..");
const PACKAGE = join(EVALS, "..");
const REPO = join(PACKAGE, "..", "..");
const BUDGET_MS = 180_000;

let root: string;
let project: string;
let transcript: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nt-trace-graders-"));
  project = join(root, "project");
  transcript = join(root, "transcript.jsonl");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

let cacheRoot: string;
const states = new Map<string, string>();

beforeAll(() => {
  cacheRoot = mkdtempSync(join(tmpdir(), "nt-trace-graders-cache-"));
});

afterAll(() => {
  rmSync(cacheRoot, { recursive: true, force: true });
});

/** A named project state, built ONCE by really running Vitest, then copied into every test. */
async function buildState(name: string, build: () => Promise<void>): Promise<void> {
  project = join(cacheRoot, name);
  await build();
  states.set(name, project);
}

function restore(name: string): void {
  const built = states.get(name);
  if (built === undefined) throw new Error(`state ${name} was never built`);
  cpSync(built, project, { recursive: true });
}

/** The artifact a real run must have left — a miss names it and shows what the run said. */
function requireArtifact(relative: string, runOutput: string): void {
  if (existsSync(join(project, relative))) return;
  throw new Error(`the fixture run left no ${relative}; it printed:\n${runOutput.slice(-2000)}`);
}

function link(target: string, at: string): void {
  mkdirSync(join(at, ".."), { recursive: true });
  symlinkSync(target, at);
}

/** The packed kit, extracted where npm would install it — its code exists nowhere else. */
function installTheKit(modules: string): void {
  const kit = join(modules, "@acme", "checkout-kit");
  mkdirSync(kit, { recursive: true });
  const tarball = join(project, "vendor", "acme-checkout-kit-2.4.1.tgz");
  execFileSync("tar", ["-xzf", tarball, "-C", kit, "--strip-components=1"]);
}

/** What `checkout-install` leaves: the fixture, with this checkout's packages resolvable. */
function scaffold(fixture: string): void {
  cpSync(join(EVALS, "fixtures", fixture), project, { recursive: true });
  const modules = join(project, "node_modules");
  link(join(PACKAGE, "node_modules", "@narrativetrace"), join(modules, "@narrativetrace"));
  link(join(REPO, "node_modules", "vitest"), join(modules, "vitest"));
  link(join(REPO, "node_modules", ".bin", "vitest"), join(modules, ".bin", "vitest"));
  link(
    join(PACKAGE, "node_modules", ".bin", "narrativetrace-approve"),
    join(modules, ".bin", "narrativetrace-approve"),
  );
  if (fixture === "existing-service-checkout") installTheKit(modules);
}

function write(relative: string, text: string): void {
  mkdirSync(join(project, relative, ".."), { recursive: true });
  writeFileSync(join(project, relative), text);
}

function read(relative: string): string {
  return readFileSync(join(project, relative), "utf8");
}

function onlyFileIn(dir: string, suffix: string): string {
  const found = readdirSync(join(project, dir)).filter((name) => name.endsWith(suffix));
  if (found.length !== 1) throw new Error(`expected one ${suffix} in ${dir}, found ${found}`);
  return join(dir, found[0] as string);
}

/**
 * One child process, awaited without blocking: a synchronous spawn holds the worker's event loop
 * for the whole Vitest run inside it, and the runner reports `Timeout calling "onTaskUpdate"`.
 */
function spawnAsync(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: project, env });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (status) => resolve({ status, out }));
  });
}

async function run(command: string, args: string[]): Promise<string> {
  return (await spawnAsync(command, args)).out;
}

// --- transcripts --------------------------------------------------------------------------------

type Line = Record<string, unknown>;
const turn = (n: number, text: string): Line => ({ nt_turn: n, role: "user", text });
const says = (text: string): Line => ({
  type: "assistant",
  message: { content: [{ type: "text", text }] },
});
const bash = (command: string): Line => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] },
});
const edit = (file_path: string): Line => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", name: "Edit", input: { file_path } }] },
});
const sees = (content: string): Line => ({
  type: "user",
  message: { content: [{ type: "tool_result", content }] },
});

function record(lines: readonly Line[]): void {
  writeFileSync(transcript, lines.map((line) => JSON.stringify(line)).join("\n"));
}

function grade(skill: string, testCase: string): Promise<{ status: number | null; out: string }> {
  const verify = join(EVALS, skill, testCase, "graders", "verify.sh");
  return spawnAsync("sh", [verify], { ...process.env, NARRATIVETRACE_TRANSCRIPT: transcript });
}

const FLOW_NT = "narrativetrace-output/structural/checkout-flow/customer_checks_out.nt";
const FLOW_MD = "narrativetrace-output/checkout-flow/customer_checks_out.md";

// --- verify: the unintended interaction ------------------------------------------------------------

/** The receipt sent from the kit's onPaid hook — where its README says to put it. */
function receiptFromHook(): void {
  const wiring = read("src/checkout.js").replace(
    "hooks: [] });",
    'hooks: [{ onPaid: (invoice) => notifications.send(invoice.customerId, "Receipt " + invoice.id) }] });',
  );
  write("src/checkout.js", wiring);
}

/** The receipt sent after the kit settled — the fix the trace points at. */
function receiptAfterSettlement(): void {
  write(
    "src/checkout-service.js",
    `export class CheckoutService {
  constructor(kit, notifications) {
    this.kit = kit;
    this.notifications = notifications;
  }

  checkout(order) {
    const result = this.kit.run(order);
    this.notifications.send(order.customerId, \`Receipt \${result.invoiceId}\`);
    return result;
  }
}
`,
  );
  write(
    "src/checkout.js",
    read("src/checkout.js").replace(
      "new CheckoutService(kit)",
      "new CheckoutService(kit, notifications)",
    ),
  );
}

/** Approval mode on in the flow test, the review copy written, then promoted. */
async function pinTheFlow(): Promise<void> {
  write(
    "test/checkout-flow.test.js",
    read("test/checkout-flow.test.js").replace(
      "createNarrativeTest()",
      "createNarrativeTest({ approval: true })",
    ),
  );
  await run("npx", ["vitest", "run"]);
  await run("npx", ["narrativetrace-approve"]);
  const last = await run("npx", ["vitest", "run"]);
  requireArtifact(FLOW_NT, last);
  requireArtifact("narratives/checkout-flow/customer_checks_out.approved.nt", last);
}

function verifyTranscript(
  options: { intentFirst?: boolean; valuesFirst?: boolean; promoteEarly?: boolean } = {},
): Line[] {
  const intent = says(
    "Intent: checkout issues the invoice, authorizes, settles (confirm), THEN sends the receipt once.",
  );
  const theRun = [bash("npx vitest run test/checkout-flow.test.js"), sees("Tests 1 passed")];
  const before = read(FLOW_NT);
  const values = [bash(`cat ${FLOW_MD}`), sees(read(FLOW_MD))];
  const structure = [bash(`cat ${FLOW_NT}`), sees(before)];
  return [
    turn(1, "add the receipt"),
    ...(options.intentFirst === false ? [] : [intent]),
    ...theRun,
    ...(options.intentFirst === false ? [intent] : []),
    ...(options.valuesFirst ? [...values, ...structure] : [...structure]),
    says(
      "The trace shows #1.4 NotificationService.send after #1.3.1 PaymentGateway.confirm, as intended.",
    ),
    ...(options.promoteEarly ? [bash("npx narrativetrace-approve")] : []),
    says(
      `${read("narratives/checkout-flow/customer_checks_out.approved.nt")}\nShall I pin this flow as the baseline?`,
    ),
    turn(2, "yes, pin it"),
    bash("npx narrativetrace-approve"),
    says("Pinned: #1.4 NotificationService.send now follows #1.3.1 PaymentGateway.confirm."),
  ];
}

describe("the verify grader — unintended interaction", () => {
  beforeAll(async () => {
    await buildState("receipt-from-hook", async () => {
      scaffold("existing-service-checkout");
      receiptFromHook();
      await pinTheFlow();
    });
    await buildState("receipt-after-settlement", async () => {
      scaffold("existing-service-checkout");
      receiptAfterSettlement();
      await pinTheFlow();
    });
  }, BUDGET_MS);

  it(
    "passes a solved trial: intent first, structure read, the receipt after confirm, pinned, cited",
    async () => {
      restore("receipt-after-settlement");
      record(verifyTranscript());
      const result = await grade("narrativetrace-verify", "verify-unintended-interaction");
      expect(result.out).not.toMatch(/^FAIL/m);
      expect(result.status).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "fails the trial that sent the receipt from the hook: the receipt precedes confirm",
    async () => {
      restore("receipt-from-hook");
      record(verifyTranscript());
      const result = await grade("narrativetrace-verify", "verify-unintended-interaction");
      expect(result.out).toMatch(
        /FAIL in the final run, NotificationService\.send follows PaymentGateway\.confirm/,
      );
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails a trial that wrote its intent only after the traced run",
    async () => {
      restore("receipt-after-settlement");
      record(verifyTranscript({ intentFirst: false }));
      expect((await grade("narrativetrace-verify", "verify-unintended-interaction")).out).toMatch(
        /FAIL the intent is written before the first traced run/,
      );
    },
    BUDGET_MS,
  );

  it(
    "fails a trial that opened the values before the structure",
    async () => {
      restore("receipt-after-settlement");
      record(verifyTranscript({ valuesFirst: true }));
      expect((await grade("narrativetrace-verify", "verify-unintended-interaction")).out).toMatch(
        /FAIL values were not opened before the structural trace/,
      );
    },
    BUDGET_MS,
  );

  it(
    "fails a trial that promoted before the yes",
    async () => {
      restore("receipt-after-settlement");
      record(verifyTranscript({ promoteEarly: true }));
      expect((await grade("narrativetrace-verify", "verify-unintended-interaction")).out).toMatch(
        /FAIL nothing was promoted before the scripted yes/,
      );
    },
    BUDGET_MS,
  );

  it(
    "fails the untouched fixture and an empty transcript on every count that matters",
    async () => {
      scaffold("existing-service-checkout");
      record([turn(1, "add the receipt"), says("Done, tests pass.")]);
      const result = await grade("narrativetrace-verify", "verify-unintended-interaction");
      expect(result.out).toMatch(/FAIL the conversation reached the scripted reply/);
      expect(result.out).toMatch(/FAIL a structural trace was read/);
      expect(result.out).toMatch(/FAIL a baseline pinning the fixed flow exists/);
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );
});

// --- verify: the skip ----------------------------------------------------------------------------

function capTheFee(): void {
  write(
    "src/late-fees.js",
    "export function feeFor(daysLate) {\n  if (daysLate <= 0) return 0;\n  return Math.min(daysLate * 150, 2000);\n}\n",
  );
}

describe("the verify grader — skip", () => {
  it(
    "passes a capped pure function and a spoken skip with its reason",
    async () => {
      scaffold("existing-service-checkout");
      capTheFee();
      record([
        turn(1, "cap it"),
        says("skipping narrativetrace-verify: a pure function with its own unit test."),
      ]);
      const result = await grade("narrativetrace-verify", "verify-skip");
      expect(result.out).not.toMatch(/^FAIL/m);
      expect(result.status).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "fails a trial that traced the pure function anyway",
    async () => {
      scaffold("existing-service-checkout");
      capTheFee();
      await run("npx", ["vitest", "run"]);
      record([
        turn(1, "cap it"),
        bash(`cat ${FLOW_NT}`),
        sees(read(FLOW_NT)),
        says("skipping: a pure function"),
      ]);
      expect((await grade("narrativetrace-verify", "verify-skip")).out).toMatch(
        /FAIL no structural trace was read for a pure-function change/,
      );
    },
    BUDGET_MS,
  );

  it(
    "fails an uncapped fee and a silent skip",
    async () => {
      scaffold("existing-service-checkout");
      record([turn(1, "cap it"), says("Done.")]);
      const result = await grade("narrativetrace-verify", "verify-skip");
      expect(result.out).toMatch(/FAIL the late fee is capped at 2000 cents/);
      expect(result.out).toMatch(/FAIL the transcript says the skill was skipped and why/);
    },
    BUDGET_MS,
  );

  it(
    "fails a trial that switched approval mode on for a pure function",
    async () => {
      scaffold("existing-service-checkout");
      capTheFee();
      write(
        "test/checkout-flow.test.js",
        read("test/checkout-flow.test.js").replace(
          "createNarrativeTest()",
          "createNarrativeTest({ approval: true })",
        ),
      );
      record([turn(1, "cap it"), says("skipping narrativetrace-verify: a pure function")]);
      expect((await grade("narrativetrace-verify", "verify-skip")).out).toMatch(
        /FAIL approval mode was not switched on/,
      );
    },
    BUDGET_MS,
  );
});

// --- debug: the value divergence ------------------------------------------------------------------

const REPRO = "test/ticket-4471.test.js";
/** The reproduction's narrative, wherever this runtime's artifact naming put it. */
const reproMd = () => onlyFileIn("narrativetrace-output/ticket-4471", ".md");

/** The reproduction the skill writes: the ticket's input through the real flow, approval on. */
function writeReproduction(): void {
  write(
    REPRO,
    `import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { compose } from "../src/checkout.js";

const test = createNarrativeTest({ approval: true });

test("the ticket's card is charged CHF 42.77", ({ narrativeContext }) => {
  const { checkout } = compose((service, names) => traceObject(service, narrativeContext, names));
  const result = checkout.checkout({ customerId: "C-2041", currency: "EUR", lines: [{ sku: "ORD-88", priceCents: 4599, quantity: 1 }] });
  expect(result).toMatchObject({ chargedCents: 4277, currency: "CHF" });
});
`,
  );
}

function fixTheConverter(): void {
  write(
    "src/rate-table-converter.js",
    read("src/rate-table-converter.js").replace(
      "const units = Math.round((amountCents / 100) * rate);\n    return units * 100;",
      "return Math.round(amountCents * rate);",
    ),
  );
}

/** The near miss that routes around the span: the charge computed without the converter. */
function routeAroundTheConverter(): void {
  write(
    "src/checkout-service.js",
    read("src/checkout-service.js").replace(
      "const chargeCents = this.converter.convert(invoice.amountCents, invoice.currency, currency);",
      "const chargeCents = currency === invoice.currency ? invoice.amountCents : Math.round(invoice.amountCents * 0.93);",
    ),
  );
}

async function pinTheReproduction(): Promise<void> {
  await run("npx", ["vitest", "run"]);
  await run("npx", ["narrativetrace-approve"]);
  requireArtifact("narrativetrace-output/ticket-4471", await run("npx", ["vitest", "run"]));
}

function debugTranscript(redMd: string, options: { namedAfterFix?: boolean } = {}): Line[] {
  const named = says("The value diverges at #1.3 RateTableConverter.convert: 4599 in, 4300 out.");
  return [
    turn(1, "ticket 4471"),
    bash(`npx vitest run ${REPRO}`),
    sees(redMd),
    ...(options.namedAfterFix ? [] : [named]),
    edit("src/rate-table-converter.js"),
    ...(options.namedAfterFix ? [named] : []),
    says(
      "Root cause: #1.3 RateTableConverter.convert rounded to whole francs before cents.\nPin the reproduction?",
    ),
    turn(2, "yes, pin it"),
    bash("npx narrativetrace-approve"),
    says("Pinned. The defect was at #1.3."),
  ];
}

/** The reproduction run red, as the agent saw it before the fix. */
async function redReproduction(): Promise<string> {
  writeReproduction();
  const out = await run("npx", ["vitest", "run", REPRO]);
  requireArtifact("narrativetrace-output/ticket-4471", out);
  return read(reproMd());
}

describe("the debug grader — value divergence", () => {
  let red: string;

  beforeAll(async () => {
    await buildState("red", async () => {
      scaffold("existing-service-checkout-currency");
      red = await redReproduction();
    });
    await buildState("fixed-and-pinned", async () => {
      restore("red");
      fixTheConverter();
      await pinTheReproduction();
    });
    await buildState("routed-around-and-pinned", async () => {
      restore("red");
      routeAroundTheConverter();
      await pinTheReproduction();
    });
  }, BUDGET_MS);

  it(
    "passes a solved trial: values read, #1.3 named before the fix, fixed there, kept, pinned",
    async () => {
      restore("fixed-and-pinned");
      record(debugTranscript(red));
      const result = await grade("narrativetrace-debug", "debug-value-divergence");
      expect(result.out).not.toMatch(/^FAIL/m);
      expect(result.status).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "fails the route around the span: the converter's value is still wrong and the shape moved",
    async () => {
      restore("routed-around-and-pinned");
      record(debugTranscript(red));
      const result = await grade("narrativetrace-debug", "debug-value-divergence");
      expect(result.out).toMatch(/FAIL the diverging span now carries the right value/);
      expect(result.out).toMatch(
        /FAIL the structural delta against the pre-fix run shows nothing else moved/,
      );
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );

  it(
    "fails a trial that named the span only after changing the code",
    async () => {
      restore("fixed-and-pinned");
      record(debugTranscript(red, { namedAfterFix: true }));
      expect((await grade("narrativetrace-debug", "debug-value-divergence")).out).toMatch(
        /FAIL the diverging span is named by its id before the fix/,
      );
    },
    BUDGET_MS,
  );

  it(
    "fails a fix with no regression test: undoing it leaves every test green",
    async () => {
      restore("red");
      rmSync(join(project, REPRO));
      fixTheConverter();
      record(debugTranscript(red));
      const result = await grade("narrativetrace-debug", "debug-value-divergence");
      expect(result.out).toMatch(/FAIL a regression test fails when the fix is undone/);
      expect(result.out).toMatch(/FAIL a baseline pinning the reproduced flow exists/);
    },
    BUDGET_MS,
  );

  it(
    "fails the untouched fixture",
    async () => {
      scaffold("existing-service-checkout-currency");
      record([turn(1, "ticket 4471"), says("I could not reproduce it.")]);
      const result = await grade("narrativetrace-debug", "debug-value-divergence");
      expect(result.out).toMatch(/FAIL the fix touches the diverging span's code/);
      expect(result.out).toMatch(/FAIL the values of the reproduction were read before the fix/);
      expect(result.status).toBe(1);
    },
    BUDGET_MS,
  );
});
