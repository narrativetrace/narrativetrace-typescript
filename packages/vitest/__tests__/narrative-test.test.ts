// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AsyncNarrativeContext,
  NarrativeTraceConfig,
  parameterCapture,
} from "@narrativetrace/core-node";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createNarrativeTest,
  DEFAULT_TEST_BUFFER_CAPACITY,
  moduleNameOf,
  narrativeTest,
  refusalNotice,
  reportCaptureShedding,
  reportTestNarrative,
  resolveFixtureConfig,
  shedNotice,
  writeTraceOutput,
} from "../src/index.js";

describe("reportTestNarrative", () => {
  function capture(fn: (sink: { write(t: string): void }) => void): string {
    let buf = "";
    fn({ write: (t) => (buf += t) });
    return buf;
  }

  function tracedTree(narration?: string) {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("OrderService", "placeOrder", [], narration ? { narration } : undefined);
    ctx.exitMethodWithReturn('"OK"');
    return ctx.captureTrace();
  }

  test("prints nothing for a passing test with a clean trace", () => {
    const out = capture((sink) => reportTestNarrative(tracedTree(), "places order", false, sink));
    expect(out).toBe("");
  });

  test("prints unresolved-template warnings even when the test passes", () => {
    const out = capture((sink) =>
      reportTestNarrative(tracedTree("for {customer.name}"), "places order", false, sink),
    );
    expect(out).toContain("WARNING: Unresolved template placeholder(s) detected:");
    expect(out).toContain("OrderService.placeOrder: {customer.name} in narration");
  });

  test("prints the framed failure report with the execution trace when the test fails", () => {
    const out = capture((sink) => reportTestNarrative(tracedTree(), "placesAnOrder", true, sink));
    expect(out).toContain("Places an order");
    expect(out).toContain("Execution trace:");
    expect(out).toContain("OrderService.placeOrder");
  });

  test("prints nothing for an empty trace", () => {
    const empty = new AsyncNarrativeContext(new NarrativeTraceConfig()).captureTrace();
    const out = capture((sink) => reportTestNarrative(empty, "x", true, sink));
    expect(out).toBe("");
  });
});

describe("resolveFixtureConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test("defaults to detail plus the full per-test artifact set", () => {
    delete process.env.NARRATIVETRACE_LEVEL;
    delete process.env.NARRATIVETRACE_OUTPUT_DIR;
    delete process.env.NARRATIVETRACE_FORMAT;
    expect(resolveFixtureConfig()).toEqual({
      level: "detail",
      outputDir: "narrativetrace-output",
      formats: ["md", "json", "mmd"],
      bufferCapacity: 8192,
    });
  });

  test("reads level, outputDir and format from the env channel", () => {
    process.env.NARRATIVETRACE_LEVEL = "summary";
    process.env.NARRATIVETRACE_OUTPUT_DIR = "/tmp/out";
    process.env.NARRATIVETRACE_FORMAT = "json,mermaid";
    expect(resolveFixtureConfig()).toEqual({
      level: "summary",
      outputDir: "/tmp/out",
      formats: ["json", "mmd"],
      bufferCapacity: 8192,
    });
  });

  test("degrades a garbage level to detail without throwing", () => {
    process.env.NARRATIVETRACE_LEVEL = "loud";
    expect(resolveFixtureConfig().level).toBe("detail");
  });

  test("explicit options win over the env channel", () => {
    process.env.NARRATIVETRACE_LEVEL = "off";
    expect(resolveFixtureConfig({ level: "narrative" }).level).toBe("narrative");
  });
});

describe("resolveFixtureConfig — project config file channel", () => {
  const saved = { ...process.env };
  let projectRoot: string;

  beforeEach(() => {
    for (const key of [
      "NARRATIVETRACE_LEVEL",
      "NARRATIVETRACE_OUTPUT_DIR",
      "NARRATIVETRACE_FORMAT",
    ])
      delete process.env[key];
    projectRoot = mkdtempSync(join(tmpdir(), "nt-config-"));
    // cwd is stubbed rather than changed: process.chdir would leak across the worker's tests.
    vi.spyOn(process, "cwd").mockReturnValue(projectRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
    process.env = { ...saved };
  });

  function writeConfig(name: string, body: string): void {
    writeFileSync(join(projectRoot, name), body, "utf-8");
  }

  test("reads level, outputDir and format from narrativetrace.config.json", () => {
    writeConfig(
      "narrativetrace.config.json",
      '{"level":"summary","outputDir":"traces","format":"json,mermaid"}',
    );
    expect(resolveFixtureConfig()).toEqual({
      level: "summary",
      outputDir: "traces",
      formats: ["json", "mmd"],
      bufferCapacity: 8192,
    });
  });

  test("lets the env channel override the config file", () => {
    writeConfig("narrativetrace.config.json", '{"level":"summary","outputDir":"traces"}');
    process.env.NARRATIVETRACE_LEVEL = "off";
    const config = resolveFixtureConfig();
    expect(config.level).toBe("off");
    expect(config.outputDir).toBe("traces");
  });

  test("lets explicit options win over both the env channel and the config file", () => {
    writeConfig("narrativetrace.config.json", '{"level":"summary","outputDir":"traces"}');
    process.env.NARRATIVETRACE_LEVEL = "off";
    expect(resolveFixtureConfig({ level: "narrative", outputDir: "explicit" })).toEqual({
      level: "narrative",
      outputDir: "explicit",
      formats: ["md", "json", "mmd"],
      bufferCapacity: 8192,
    });
  });

  test("fails the run when the project declares two config sources", () => {
    writeConfig("narrativetrace.config.json", '{"level":"summary"}');
    writeConfig(".narrativetracerc.json", '{"level":"off"}');
    expect(() => resolveFixtureConfig()).toThrow(/Multiple NarrativeTrace configuration sources/);
  });

  test("fails the run on a malformed config file rather than silently using defaults", () => {
    writeConfig("narrativetrace.config.json", "{level: summary");
    expect(() => resolveFixtureConfig()).toThrow(/narrativetrace\.config\.json/);
  });
});

describe("narrativeTest fixture", () => {
  narrativeTest("provides a fresh NarrativeContext", ({ narrativeContext }) => {
    expect(narrativeContext).toBeDefined();
    expect(narrativeContext.isActive).toBe(true);
  });

  narrativeTest("traces at detail, the unconfigured default", ({ narrativeContext }) => {
    // `detail` is the level that captures parameter values, so this is the observable difference
    // between inheriting NarrativeTraceConfig's default and inheriting something else.
    expect(narrativeContext.capturesParameterValues).toBe(true);
  });

  narrativeTest("captures trace after method calls", ({ narrativeContext }) => {
    narrativeContext.enterMethod("OrderService", "placeOrder", []);
    narrativeContext.exitMethodWithReturn('"OK"');

    const tree = narrativeContext.captureTrace();
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.signature.className).toBe("OrderService");
  });
});

describe("moduleNameOf", () => {
  test.each([
    ["/repo/src/__tests__/order-service.test.ts", "order-service"],
    ["/repo/src/__tests__/order-service.spec.ts", "order-service"],
    ["/repo/src/__tests__/checkout.test.tsx", "checkout"],
    ["/repo/src/__tests__/legacy.test.mts", "legacy"],
    ["C:\\repo\\__tests__\\billing.test.ts", "billing"],
    ["plain.ts", "plain"],
  ])("derives %s → %s", (filepath, expected) => {
    expect(moduleNameOf(filepath)).toBe(expected);
  });

  test.each([undefined, ""])("falls back to unknown-module for %s", (filepath) => {
    expect(moduleNameOf(filepath)).toBe("unknown-module");
  });

  test("keeps a dotted file name intact apart from the extension", () => {
    expect(moduleNameOf("/repo/__tests__/order.v2.test.ts")).toBe("order.v2");
  });
});

describe("writeTraceOutput", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "narrative-test-"));
  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("writes markdown file for trace", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("OrderService", "placeOrder", [
      parameterCapture("orderId", '"order-42"', false),
    ]);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();

    writeTraceOutput(tree, {
      outputDir: tmpDir,
      moduleName: "order-service",
      testName: "places order",
      formats: ["md"],
    });

    const filePath = join(tmpDir, "order-service", "places_order.md");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("OrderService.placeOrder");
  });

  test("writes mermaid file for trace", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();

    writeTraceOutput(tree, {
      outputDir: tmpDir,
      moduleName: "order-service",
      testName: "places order",
      formats: ["mmd"],
    });

    const filePath = join(tmpDir, "diagrams", "order-service", "places_order.mmd");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("sequenceDiagram");
    expect(content).toContain("OrderService");
  });

  test("writes both md and mmd when multiple formats specified", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();

    const subDir = join(tmpDir, "multi-format");
    writeTraceOutput(tree, {
      outputDir: subDir,
      moduleName: "order-service",
      testName: "multi format test",
      formats: ["md", "mmd"],
    });

    expect(existsSync(join(subDir, "order-service", "multi_format_test.md"))).toBe(true);
    expect(existsSync(join(subDir, "diagrams", "order-service", "multi_format_test.mmd"))).toBe(
      true,
    );
  });

  test("writes json file for trace", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();

    writeTraceOutput(tree, {
      outputDir: tmpDir,
      moduleName: "order-service",
      testName: "places order",
      formats: ["json"],
    });

    const filePath = join(tmpDir, "order-service", "places_order.json");
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(content.version).toBe("1.0");
    expect(content.scenario.name).toBe("places order");
    expect(content.events).toHaveLength(2);
  });

  test("humanizes a camelCase test name into the scenario label via frameScenario", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();

    const subDir = join(tmpDir, "framed-scenario");
    writeTraceOutput(tree, {
      outputDir: subDir,
      moduleName: "order-service",
      testName: "placesAnOrder",
      formats: ["json"],
    });

    const content = JSON.parse(
      readFileSync(join(subDir, "order-service", "placesAnOrder.json"), "utf-8"),
    );
    expect(content.scenario.name).toBe("Places an order");
  });

  test("writes clarity-json file for trace", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();

    writeTraceOutput(tree, {
      outputDir: tmpDir,
      moduleName: "order-service",
      testName: "places order",
      formats: ["clarity-json"],
    });

    const filePath = join(tmpDir, "order-service", "places_order.clarity-json");
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    // Java-compatible flat shape (TW9): version + scenarios[] with *Score keys.
    expect(content.version).toBe("1.0");
    const scenario = content.scenarios[0];
    expect(scenario.name).toBe("places order");
    expect(typeof scenario.overallScore).toBe("number");
    expect(scenario.methodNameScore).toBeDefined();
    expect(scenario.issues).toBeDefined();
  });

  test("writes plantuml file for trace", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();

    writeTraceOutput(tree, {
      outputDir: tmpDir,
      moduleName: "order-service",
      testName: "places order",
      formats: ["puml"],
    });

    const filePath = join(tmpDir, "diagrams", "order-service", "places_order.puml");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("@startuml");
    expect(content).toContain("OrderService");
  });

  test("sanitizes path-unsafe characters from test names", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();

    const subDir = join(tmpDir, "sanitize");
    writeTraceOutput(tree, {
      outputDir: subDir,
      moduleName: "order-service",
      testName: "../../etc/passwd",
      formats: ["md"],
    });

    // Must not escape the output directory
    expect(existsSync(join(subDir, "..", "..", "etc"))).toBe(false);
    // File should exist in the module directory with unsafe chars stripped
    const moduleDir = join(subDir, "order-service");
    const files = existsSync(moduleDir) ? readdirSync(moduleDir) : [];
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.md$/);
    expect(files[0]).not.toContain("/");
    expect(files[0]).not.toContain("..");
  });

  test("falls back to unnamed_test when name is all special characters", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();

    const subDir = join(tmpDir, "unnamed");
    writeTraceOutput(tree, {
      outputDir: subDir,
      moduleName: "order-service",
      testName: "!!!",
      formats: ["md"],
    });

    const filePath = join(subDir, "order-service", "unnamed_test.md");
    expect(existsSync(filePath)).toBe(true);
  });

  // Security fuzz suite finding: sanitizing never bounded the *length* of a module/test name, so
  // a long hostile value (the corpus's own "one mebibyte in one value" case, or just a generated
  // property-test description) survived sanitization intact and then blew the filesystem's path-
  // component limit, throwing ENAMETOOLONG out of writeTraceOutput instead of writing a truncated
  // but usable artifact.
  test("truncates a very long test name instead of exceeding the filesystem's path limit", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');
    const tree = ctx.captureTrace();

    const subDir = join(tmpDir, "long-name");
    expect(() =>
      writeTraceOutput(tree, {
        outputDir: subDir,
        moduleName: "order-service",
        testName: "A".repeat(10_000),
        formats: ["md"],
      }),
    ).not.toThrow();

    const moduleDir = join(subDir, "order-service");
    const files = existsSync(moduleDir) ? readdirSync(moduleDir) : [];
    expect(files).toHaveLength(1);
    expect((files[0] as string).length).toBeLessThan(120);
  });

  test("groups a module's traces under its own directory, diagrams in a parallel tree", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');

    const subDir = join(tmpDir, "layout");
    writeTraceOutput(ctx.captureTrace(), {
      outputDir: subDir,
      moduleName: "checkout-flow",
      testName: "places order",
      formats: ["md", "json", "mmd", "puml"],
    });

    // Narrative artifacts sit together per module; diagrams get their own mirrored tree.
    expect(readdirSync(join(subDir, "checkout-flow")).sort()).toEqual([
      "places_order.json",
      "places_order.md",
    ]);
    expect(readdirSync(join(subDir, "diagrams", "checkout-flow")).sort()).toEqual([
      "places_order.mmd",
      "places_order.puml",
    ]);
  });

  test("keeps two modules' identically-named tests apart", () => {
    const subDir = join(tmpDir, "two-modules");
    for (const moduleName of ["billing", "shipping"]) {
      const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
      ctx.enterMethod(moduleName, "run", []);
      ctx.exitMethodWithReturn('"ok"');
      writeTraceOutput(ctx.captureTrace(), {
        outputDir: subDir,
        moduleName,
        testName: "same name",
        formats: ["md"],
      });
    }

    expect(readFileSync(join(subDir, "billing", "same_name.md"), "utf-8")).toContain("billing.run");
    expect(readFileSync(join(subDir, "shipping", "same_name.md"), "utf-8")).toContain(
      "shipping.run",
    );
  });

  test("sanitizes the module name so a crafted file path cannot escape the output dir", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("Svc", "op", []);
    ctx.exitMethodWithReturn('"ok"');

    const subDir = join(tmpDir, "module-escape");
    writeTraceOutput(ctx.captureTrace(), {
      outputDir: subDir,
      moduleName: "../../etc",
      testName: "t",
      formats: ["md"],
    });

    expect(existsSync(join(subDir, "..", "..", "etc"))).toBe(false);
    expect(readdirSync(subDir)).not.toContain("..");
  });

  test("skips writing when trace has no roots", () => {
    const config = new NarrativeTraceConfig();
    const ctx = new AsyncNarrativeContext(config);
    const tree = ctx.captureTrace();

    const subDir = join(tmpDir, "empty-trace");
    writeTraceOutput(tree, {
      outputDir: subDir,
      moduleName: "order-service",
      testName: "empty test",
      formats: ["md"],
    });

    expect(existsSync(subDir)).toBe(false);
  });
});

describe("createNarrativeTest suite disambiguation", () => {
  const tmpDir2 = mkdtempSync(join(tmpdir(), "narrative-dedup-"));
  afterAll(() => rmSync(tmpDir2, { recursive: true, force: true }));

  const tracedTest2 = createNarrativeTest({
    outputDir: tmpDir2,
    formats: ["md"],
  });

  describe("suite A", () => {
    tracedTest2("same name", ({ narrativeContext }) => {
      narrativeContext.enterMethod("SuiteA", "run", []);
      narrativeContext.exitMethodWithReturn('"ok"');
    });
  });

  describe("suite B", () => {
    tracedTest2("same name", ({ narrativeContext }) => {
      narrativeContext.enterMethod("SuiteB", "run", []);
      narrativeContext.exitMethodWithReturn('"ok"');
    });
  });

  test("same test name in different suites produces distinct output files", () => {
    // Both tests live in this file, so they share one module directory — the suite chain in the
    // file name is what keeps them apart.
    const moduleDir = join(tmpDir2, "narrative-test");
    const files = existsSync(moduleDir) ? readdirSync(moduleDir) : [];
    expect(files).toHaveLength(2);

    const contents = files.map((f) => readFileSync(join(moduleDir, f), "utf-8"));
    expect(contents.some((c) => c.includes("SuiteA.run"))).toBe(true);
    expect(contents.some((c) => c.includes("SuiteB.run"))).toBe(true);
  });
});

describe("createNarrativeTest", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "narrative-create-"));
  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("accepts no arguments with defaults", () => {
    const defaultTest = createNarrativeTest();
    expect(defaultTest).toBeDefined();
  });

  const tracedTest = createNarrativeTest({
    outputDir: tmpDir,
    formats: ["md"],
  });

  tracedTest("auto-writes trace files on teardown", ({ narrativeContext }) => {
    narrativeContext.enterMethod("OrderService", "placeOrder", []);
    narrativeContext.exitMethodWithReturn('"OK"');
  });

  test("trace file was written by previous test teardown", () => {
    const filePath = join(
      tmpDir,
      "narrative-test",
      "createNarrativeTest_auto-writes_trace_files_on_teardown.md",
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("OrderService.placeOrder");
  });

  tracedTest("records exception trace on error", ({ narrativeContext }) => {
    narrativeContext.enterMethod("PaymentService", "charge", [
      parameterCapture("amount", "100", false),
    ]);
    narrativeContext.exitMethodWithException(new Error("insufficient funds"));
  });

  test("exception trace file contains error marker", () => {
    const filePath = join(
      tmpDir,
      "narrative-test",
      "createNarrativeTest_records_exception_trace_on_error.md",
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("insufficient funds");
    expect(content).toContain("error_count: 1");
  });

  // Bug-hunt no-poison contract: mirrors Java's JUnit4 finding — a failing test must
  // still get its class/suite-level reporting. Here that means the fixture's teardown (artifact
  // write, task.meta clarity/glossary stamping, pipeline close) must run even when the test body
  // itself throws, not only when it records a business exception inside a passing test (the
  // "records exception trace on error" case above never fails the Vitest test itself).
  // test.fails() marks the failure as expected, so a real assertion failure exercises the fixture
  // teardown path without leaving a red test in the suite.
  tracedTest.fails("teardown must still run when the test itself fails", ({ narrativeContext }) => {
    narrativeContext.enterMethod("OrderService", "riskyOp", []);
    narrativeContext.exitMethodWithReturn('"OK"');
    expect(true).toBe(false);
  });

  test("trace file was still written when the test itself failed", () => {
    const filePath = join(
      tmpDir,
      "narrative-test",
      "createNarrativeTest_teardown_must_still_run_when_the_test_itself_fails.md",
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("OrderService.riskyOp");
  });
});

describe("shedNotice", () => {
  test("says nothing about a clean capture", () => {
    expect(shedNotice({ shedEvents: 0, capacity: 8192 })).toBeUndefined();
    expect(shedNotice(undefined)).toBeUndefined();
  });

  test("names the loss, the capacity that caused it, and the option to raise", () => {
    const notice = shedNotice({ shedEvents: 40, capacity: 8192 });
    expect(notice).toContain("dropped 40 events");
    expect(notice).toContain("(8192)");
    expect(notice).toContain("bufferCapacity: 16384");
  });

  test("suggests a capacity that would have held the whole window, not just the next double", () => {
    // 8192 shed against a 8192 ring needs 16384+; two doublings, so the advice must not stop at one.
    expect(shedNotice({ shedEvents: 20_000, capacity: 8192 })).toContain("bufferCapacity: 32768");
  });

  test("stops doubling at the size that exactly fits, rather than one past it", () => {
    // Shedding exactly the capacity needs exactly double it — the boundary where "keep doubling
    // while it does not fit" and "while it does not yet exceed" disagree.
    expect(shedNotice({ shedEvents: 8192, capacity: 8192 })).toContain("bufferCapacity: 16384");
  });

  test("counts a single dropped event in the singular", () => {
    expect(shedNotice({ shedEvents: 1, capacity: 64 })).toContain("dropped 1 event:");
  });

  test("treats a nonsensical negative count as a clean capture rather than advising on it", () => {
    expect(shedNotice({ shedEvents: -1, capacity: 64 })).toBeUndefined();
  });
});

describe("refusalNotice", () => {
  test("says nothing when nothing was refused", () => {
    expect(refusalNotice({ shedEvents: 0, capacity: 8192 })).toBeUndefined();
    expect(refusalNotice({ shedEvents: 0, capacity: 8192, refusedScopes: 0 })).toBeUndefined();
    expect(refusalNotice(undefined)).toBeUndefined();
  });

  test("names the subtrees and the spans behind them", () => {
    const notice = refusalNotice({
      shedEvents: 0,
      capacity: 8192,
      refusedScopes: 2,
      refusedSpans: 41,
    });
    expect(notice).toContain("refused 2 async subtrees");
    expect(notice).toContain("(41 spans)");
    expect(notice).toContain("adoption ceiling");
    expect(notice).toContain("those subtrees are absent");
  });

  test("counts a single refusal in the singular", () => {
    const notice = refusalNotice({
      shedEvents: 0,
      capacity: 64,
      refusedScopes: 1,
      refusedSpans: 3,
    });
    expect(notice).toContain("refused 1 async scope");
    expect(notice).toContain("that subtree is absent");
  });

  test("treats a nonsensical negative count as nothing refused", () => {
    expect(refusalNotice({ shedEvents: 0, capacity: 64, refusedScopes: -1 })).toBeUndefined();
  });

  test("reports a refusal even when the buffer shed nothing, and the reverse", () => {
    // The two holes are independent: a full ceiling with a roomy buffer, and a full buffer with an
    // empty ceiling, must each still be announced.
    const refusedOnly = { shedEvents: 0, capacity: 8192, refusedScopes: 1, refusedSpans: 4 };
    expect(shedNotice(refusedOnly)).toBeUndefined();
    expect(refusalNotice(refusedOnly)).toBeDefined();
    const shedOnly = { shedEvents: 5, capacity: 8192, refusedScopes: 0, refusedSpans: 0 };
    expect(shedNotice(shedOnly)).toBeDefined();
    expect(refusalNotice(shedOnly)).toBeUndefined();
  });
});

describe("reportCaptureShedding", () => {
  function capture(shedding: Parameters<typeof reportCaptureShedding>[0]): string {
    let buf = "";
    reportCaptureShedding(shedding, { write: (t) => (buf += t) });
    return buf;
  }

  test("prints nothing for a clean capture", () => {
    expect(capture({ shedEvents: 0, capacity: 8192 })).toBe("");
    expect(capture(undefined)).toBe("");
  });

  test("prints one marked, newline-terminated line for a shed capture", () => {
    const out = capture({ shedEvents: 7, capacity: 128 });
    expect(out).toContain("⚠️");
    expect(out).toContain("dropped 7 events");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.trimEnd().split("\n")).toHaveLength(1);
  });

  test("prints one line per hole, and only the ones that happened", () => {
    const both = capture({ shedEvents: 7, capacity: 128, refusedScopes: 2, refusedSpans: 30 });
    expect(both.trimEnd().split("\n")).toHaveLength(2);
    expect(both).toContain("dropped 7 events");
    expect(both).toContain("refused 2 async subtrees");

    const refusalOnly = capture({
      shedEvents: 0,
      capacity: 128,
      refusedScopes: 1,
      refusedSpans: 3,
    });
    expect(refusalOnly.trimEnd().split("\n")).toHaveLength(1);
    expect(refusalOnly).toContain("refused 1 async scope");
  });
});

describe("writeTraceOutput — shed capture footer", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "narrative-shed-"));
  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

  function write(
    dir: string,
    formats: Parameters<typeof writeTraceOutput>[1]["formats"],
    shed = 0,
  ) {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    writeTraceOutput(ctx.captureTrace(), {
      outputDir: join(tmpDir, dir),
      moduleName: "orders",
      testName: "places order",
      formats,
      shedding: { shedEvents: shed, capacity: 8192 },
    });
  }

  function read(dir: string, file: string, sub = "orders"): string {
    return readFileSync(join(tmpDir, dir, sub, file), "utf-8");
  }

  test("a clean capture says nothing in any artifact", () => {
    write("clean", ["md", "json", "mmd"]);
    expect(read("clean", "places_order.md")).not.toContain("⚠️");
    expect(read("clean", "places_order.json")).not.toContain("⚠️");
    expect(read("clean", "places_order.mmd", "diagrams/orders")).not.toContain("⚠️");
  });

  test("a shed capture carries the count and the remedy in the markdown narrative", () => {
    write("shed-md", ["md"], 40);
    const content = read("shed-md", "places_order.md");
    // A blockquote separated by a blank line, so it renders as a footnote under the narrative
    // rather than being absorbed into its last paragraph.
    expect(content).toMatch(/\n\n> ⚠️ NarrativeTrace dropped 40 events/);
    expect(content).toContain("bufferCapacity: 16384");
    expect(content.endsWith("\n")).toBe(true);
    expect(content.indexOf("⚠️")).toBeGreaterThan(content.indexOf("OrderService.placeOrder"));
  });

  test("a shed capture marks the diagrams with each language's own comment syntax", () => {
    write("shed-diagrams", ["mmd", "puml"], 40);
    expect(read("shed-diagrams", "places_order.mmd", "diagrams/orders")).toContain(
      "%% ⚠️ NarrativeTrace dropped 40 events",
    );
    expect(read("shed-diagrams", "places_order.puml", "diagrams/orders")).toContain(
      "' ⚠️ NarrativeTrace dropped 40 events",
    );
  });

  test("leaves the schema-governed JSON artifacts byte-clean and still parseable", () => {
    // chapter-tree.schema.json sets additionalProperties:false; a footer there would break every
    // cross-runtime validator, so the notice deliberately stops at the formats that can carry it.
    write("shed-json", ["json", "canonical-json"], 40);
    const chapter = read("shed-json", "places_order.json");
    expect(chapter).not.toContain("⚠️");
    expect(() => JSON.parse(chapter)).not.toThrow();
    expect(() => JSON.parse(read("shed-json", "places_order.canonical.json"))).not.toThrow();
  });

  test("a refused subtree is announced in the markdown narrative too", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    writeTraceOutput(ctx.captureTrace(), {
      outputDir: join(tmpDir, "refused-md"),
      moduleName: "orders",
      testName: "places order",
      formats: ["md"],
      shedding: { shedEvents: 40, capacity: 8192, refusedScopes: 1, refusedSpans: 6 },
    });

    const content = read("refused-md", "places_order.md");
    // Both holes, each on its own blockquote line, under one blank-line separator.
    expect(content).toMatch(/\n\n> ⚠️ NarrativeTrace dropped 40 events/);
    expect(content).toContain("> ⚠️ NarrativeTrace refused 1 async scope (6 spans)");
    expect(content.endsWith("\n")).toBe(true);
  });

  test("a target that never mentions shedding writes exactly what it always wrote", () => {
    const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig());
    ctx.enterMethod("OrderService", "placeOrder", []);
    ctx.exitMethodWithReturn('"OK"');
    const tree = ctx.captureTrace();
    const target = { moduleName: "orders", testName: "places order", formats: ["md" as const] };

    writeTraceOutput(tree, { ...target, outputDir: join(tmpDir, "unaware") });
    writeTraceOutput(tree, {
      ...target,
      outputDir: join(tmpDir, "zero"),
      shedding: { shedEvents: 0, capacity: 8192 },
    });

    expect(read("unaware", "places_order.md")).toBe(read("zero", "places_order.md"));
  });
});

describe("createNarrativeTest — capture buffer sizing", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "narrative-capacity-"));
  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("the default test capacity is 8192, not the runtime's 65536", () => {
    expect(DEFAULT_TEST_BUFFER_CAPACITY).toBe(8192);
    expect(resolveFixtureConfig().bufferCapacity).toBe(8192);
  });

  test("the fixture's capacity is overridable through the options", () => {
    expect(resolveFixtureConfig({ bufferCapacity: 512 }).bufferCapacity).toBe(512);
  });

  const roomyTest = createNarrativeTest({ outputDir: tmpDir, formats: [] });
  roomyTest("the default capacity holds an ordinary test's whole trace", ({ narrativeContext }) => {
    for (let i = 0; i < 10; i++) {
      narrativeContext.enterMethod("Svc", `op${i}`, []);
      narrativeContext.exitMethodWithReturn('"ok"');
    }
    expect(narrativeContext.captureTrace().roots).toHaveLength(10);
  });

  const tinyTest = createNarrativeTest({ outputDir: tmpDir, formats: ["md"], bufferCapacity: 4 });
  tinyTest(
    "a capacity of 4 really is 4, so a 10-call test loses its start",
    ({ narrativeContext }) => {
      for (let i = 0; i < 10; i++) {
        narrativeContext.enterMethod("Svc", `op${i}`, []);
        narrativeContext.exitMethodWithReturn('"ok"');
      }
      // Proof the fixture passed the size it was given: at 8192 nothing would have been lost.
      expect(narrativeContext.captureTrace().roots.length).toBeLessThan(10);
    },
  );

  test("the shed test's own artifact tells the reader what it lost", () => {
    const dir = join(tmpDir, "narrative-test");
    const file = readdirSync(dir).find((f) => f.includes("really_is_4"));
    expect(file).toBeDefined();
    const content = readFileSync(join(dir, file as string), "utf-8");
    expect(content).toContain("> ⚠️ NarrativeTrace dropped");
    expect(content).toContain("the capture buffer (4) overflowed");
    expect(content).toContain("bufferCapacity:");
  });
});
