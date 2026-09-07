// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  exportChapter,
  incomplete,
  methodSignature,
  NarrativeTraceConfig,
  parameterCapture,
  returned,
  type SpanId,
  SyncNarrativeContext,
  spanContext,
  type TraceId,
  type TraceTree,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core-node";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeTraceOutput } from "../src/index.js";

/**
 * Conformance is asserted against the BYTES {@link writeTraceOutput} puts on disk, never against a
 * hand-built object. The Java reference hid three defects behind a suite that validated only what
 * its own tests constructed: what ships is the file, so the file is what gets validated.
 *
 * The schemas in `schema/` are copied verbatim from the Java golden source — see `schema/README.md`.
 */

const SCHEMA_DIR = join(import.meta.dirname, "..", "..", "..", "schema");

function compile(schemaFile: string): ValidateFunction {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(JSON.parse(readFileSync(join(SCHEMA_DIR, schemaFile), "utf-8")));
}

const validateEntry = compile("entry.schema.json");
const validateChapter = compile("chapter.schema.json");
const validateChapterTree = compile("chapter-tree.schema.json");

function explain(validate: ValidateFunction, document: unknown): string {
  const failures = (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  return `${failures} — in ${JSON.stringify(document).slice(0, 400)}`;
}

function expectValid(validate: ValidateFunction, document: unknown): void {
  expect(validate(document), explain(validate, document)).toBe(true);
}

const trId = "aaaabbbbccccddddeeee111122223333" as TraceId;

function sid(n: number): SpanId {
  return n.toString(16).padStart(16, "0") as SpanId;
}

/** A trace exercising every outcome arm, a nested call, parameters and redaction. */
function richTree(): TraceTree {
  const failing = traceNode(
    methodSignature("PaymentGateway", "charge", [parameterCapture("card", "[REDACTED]", true)]),
    threw(new TypeError("card expired")),
    [],
    3,
    1_700_000_000_010,
    undefined,
    spanContext(trId, sid(2), sid(1)),
  );
  const voidCall = traceNode(
    methodSignature("Notifier", "notify", []),
    returned(null),
    [],
    1,
    1_700_000_000_020,
  );
  const pending = traceNode(methodSignature("Cache", "warm", []), incomplete(), [], 0, 0);
  const root = traceNode(
    methodSignature("OrderService", "placeOrder", [parameterCapture("id", '"o-42"', false)]),
    returned('"OK"'),
    [failing, voidCall, pending],
    30,
    1_700_000_000_000,
    undefined,
    spanContext(trId, sid(1), null, { serviceName: "orders", environment: "production" }),
  );
  return traceTree([root]);
}

/** A trace captured with no span context at all — the plain unit-test shape. */
function contextFreeTree(): TraceTree {
  const child = traceNode(methodSignature("Repo", "find", []), returned('"row"'), [], 2, 5);
  return traceTree([
    traceNode(methodSignature("Svc", "run", []), returned('"done"'), [child], 7, 0),
  ]);
}

/** A trace assembled by a real context from real events, not hand-built from nodes. */
function capturedTree(): TraceTree {
  const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const root = context.enterMethod("OrderService", "placeOrder", [
    parameterCapture("id", '"o-42"', false),
  ]);
  const child = context.enterMethod("Repo", "find", []);
  context.exitMethodWithReturn('"row"', child);
  context.exitMethodWithReturn('"OK"', root);
  return context.captureTrace();
}

/** The bytes {@link writeTraceOutput} writes for one format, read straight back. */
function written(tree: TraceTree, format: "canonical-json" | "json", extension: string): string {
  const dir = mkdtempSync(join(tmpdir(), "nt-conformance-read-"));
  try {
    writeTraceOutput(tree, { outputDir: dir, moduleName: "M", testName: "t", formats: [format] });
    return readFileSync(join(dir, "M", `t.${extension}`), "utf-8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writtenEntries(tree: TraceTree): Record<string, unknown>[] {
  return JSON.parse(written(tree, "canonical-json", "canonical.json"));
}

describe("the validation harness itself", () => {
  // A conformance gate that cannot fail is worse than none: these are the negative controls, and
  // each one mutates a document the writer really produced.
  test("rejects an entry missing a required field", () => {
    expect(validateEntry({ level: "trace", message: "x" })).toBe(false);
  });

  test("rejects an entry whose outcome is outside the enumerated vocabulary", () => {
    const exit = writtenEntries(richTree())[1] as Record<string, unknown>;

    expect(validateEntry({ ...exit, "nt.outcome": "returned" })).toBe(false);
  });

  test("rejects an entry stamped with a stale schema version", () => {
    const entry = writtenEntries(richTree())[0] as Record<string, unknown>;

    expect(validateEntry({ ...entry, "nt.schemaVersion": "1.0" })).toBe(false);
  });

  test("rejects a malformed span id", () => {
    const entry = writtenEntries(richTree())[0] as Record<string, unknown>;

    expect(validateEntry({ ...entry, span_id: "not-hex" })).toBe(false);
  });

  test("rejects a trace name that is not three lowercase words", () => {
    const entry = writtenEntries(richTree())[0] as Record<string, unknown>;

    expect(validateEntry({ ...entry, "nt.traceName": "Bold Elk" })).toBe(false);
  });

  test("rejects a chapter whose outcome is not one the schema names", () => {
    const chapter = JSON.parse(exportChapter(richTree(), { scenario: "Places an order" }));

    expect(validateChapter({ ...chapter, "nt.outcome": "error" })).toBe(false);
  });
});

describe("artifacts written by writeTraceOutput", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "nt-conformance-"));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  function write(tree: TraceTree, formats: ("canonical-json" | "json")[]): string {
    writeTraceOutput(tree, {
      outputDir,
      moduleName: "OrderServiceTest",
      testName: "places an order",
      formats,
    });
    return join(outputDir, "OrderServiceTest");
  }

  test("the canonical artifact is named <test>.canonical.json", () => {
    expect(readdirSync(write(richTree(), ["canonical-json"]))).toStrictEqual([
      "places_an_order.canonical.json",
    ]);
  });

  test("every entry of the canonical artifact validates against entry.schema.json", () => {
    const dir = write(richTree(), ["canonical-json"]);
    const entries = JSON.parse(
      readFileSync(join(dir, "places_an_order.canonical.json"), "utf-8"),
    ) as unknown[];

    expect(entries).toHaveLength(8);
    for (const entry of entries) expectValid(validateEntry, entry);
  });

  test("a context-free capture still writes schema-valid entries", () => {
    const dir = write(contextFreeTree(), ["canonical-json"]);
    const entries = JSON.parse(
      readFileSync(join(dir, "places_an_order.canonical.json"), "utf-8"),
    ) as unknown[];

    expect(entries).toHaveLength(4);
    for (const entry of entries) expectValid(validateEntry, entry);
  });

  test("a context-free capture writes one real trace id, unique to that capture", () => {
    const traceIds = (tree: TraceTree) => writtenEntries(tree).map((e) => e.trace_id as string);
    const first = traceIds(contextFreeTree());

    expect(new Set(first).size).toBe(1);
    expect(first[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(traceIds(contextFreeTree())[0]).not.toBe(first[0]);
  });

  test("the JSON artifact validates against chapter-tree.schema.json", () => {
    const dir = write(richTree(), ["json"]);

    expectValid(
      validateChapterTree,
      JSON.parse(readFileSync(join(dir, "places_an_order.json"), "utf-8")),
    );
  });

  test("both JSON artifacts can be written from one run", () => {
    const dir = write(richTree(), ["json", "canonical-json"]);

    expect(readdirSync(dir).sort()).toStrictEqual([
      "places_an_order.canonical.json",
      "places_an_order.json",
    ]);
  });

  test("a run that captured nothing writes no files at all", () => {
    writeTraceOutput(traceTree([]), {
      outputDir,
      moduleName: "Empty",
      testName: "nothing",
      formats: ["canonical-json"],
    });

    expect(readdirSync(outputDir)).toStrictEqual([]);
  });
});

describe("chapter records", () => {
  test("a successful chapter validates", () => {
    const tree = traceTree([
      traceNode(
        methodSignature("Svc", "op", []),
        returned('"ok"'),
        [],
        4,
        0,
        undefined,
        spanContext(trId, sid(1), null, { serviceName: "orders" }),
      ),
    ]);

    expectValid(validateChapter, JSON.parse(exportChapter(tree, { scenario: "Works" })));
  });

  test("a context-free chapter validates — the identity path with nothing to inherit", () => {
    // The gap this closes: `trace_id` and `nt.traceName` used to be written as `""` here, and
    // `chapter.schema.json` patterns both. No test validated these bytes, so the chapter that
    // every plain unit-test capture produces was the one document nothing checked.
    const chapter = JSON.parse(exportChapter(contextFreeTree(), { scenario: "Runs" }));

    expectValid(validateChapter, chapter);
    expect(chapter.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(chapter["nt.storyId"]).toBe("Svc.run");
    expect(chapter["nt.chapterId"]).toBe("Svc.run");
  });

  test("a chapter assembled from a real capture validates", () => {
    const chapter = JSON.parse(exportChapter(capturedTree(), { scenario: "Captures" }));

    expectValid(validateChapter, chapter);
    expect(chapter.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });

  test("the chapter names the trace the capturing context assigned", () => {
    const context = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
    const handle = context.enterMethod("Svc", "run", []);
    context.exitMethodWithReturn('"done"', handle);

    const chapter = JSON.parse(exportChapter(context.captureTrace(), { scenario: "Captures" }));

    expect(chapter.trace_id).toBe(context.currentTraceId);
  });

  test("two independent context-free captures write two distinguishable chapters", () => {
    const first = JSON.parse(exportChapter(contextFreeTree(), { scenario: "Runs" }));
    const second = JSON.parse(exportChapter(contextFreeTree(), { scenario: "Runs" }));

    expect(first.trace_id).not.toBe(second.trace_id);
  });

  test("a failing chapter validates, outcome included", () => {
    const chapter = JSON.parse(exportChapter(richTree(), { scenario: "Fails" }));

    expectValid(validateChapter, chapter);
    expect(chapter["nt.outcome"]).toBe("failure");
  });

  test("the embedded chapter tree validates against its own schema", () => {
    const chapter = JSON.parse(exportChapter(richTree(), { scenario: "Fails" }));

    expectValid(validateChapterTree, JSON.parse(chapter["nt.chapterTree"]));
  });
});
