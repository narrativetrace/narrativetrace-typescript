// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  exportJson,
  methodSignature,
  parameterCapture,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { describe, expect, test } from "vitest";
import { boundedContext } from "../src/bounded-context.js";
import { glossary } from "../src/glossary.js";
import { writeGlossaryJson } from "../src/glossary-json-writer.js";
import { glossaryTerm } from "../src/glossary-term.js";
import { runTraceTranslation } from "../src/trace-translation-run.js";

const GLOSSARY_JSON = writeGlossaryJson(
  glossary(1, new Map([["billing", boundedContext("billing", ["packages/billing"])]]), [
    glossaryTerm({
      term: "charge",
      context: "billing",
      kind: "verb-phrase",
      status: "curated",
      firstSeen: "2026-08-13",
      translations: new Map([
        ["es", "cobrar"],
        ["de", "belasten"],
      ]),
    }),
  ]),
);

const TRACE_JSON = exportJson(
  traceTree([
    traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "74.97", false)]),
      returned("true"),
      [],
    ),
  ]),
  { scenario: "charge succeeds" },
);

function run(overrides: Partial<Parameters<typeof runTraceTranslation>[0]> = {}) {
  return runTraceTranslation({
    glossaryJson: GLOSSARY_JSON,
    traces: [{ path: "narrativetrace-output/payment/charge_succeeds.json", json: TRACE_JSON }],
    locales: ["es"],
    sourcePathOf: () => "packages/billing/payment-service.ts",
    ...overrides,
  });
}

describe("runTraceTranslation", () => {
  test("translates each stored trace into each requested locale", () => {
    const artifacts = run({ locales: ["es", "de"] });

    expect(artifacts.files.map((file) => file.locale)).toStrictEqual(["es", "de"]);
    expect(artifacts.files[0]?.markdown).toContain("cobrar [charge]");
    expect(artifacts.files[1]?.markdown).toContain("belasten [charge]");
  });

  test("keeps each translation beside the path of the trace it came from", () => {
    expect(run().files[0]?.path).toBe("narrativetrace-output/payment/charge_succeeds.json");
  });

  test("summarizes the run and the curation work it uncovered", () => {
    expect(run().summary).toBe("Translation: 1 trace into es, 2 glossary gaps");
  });

  test("counts traces and gaps per locale", () => {
    const artifacts = run({
      locales: ["es", "de"],
      traces: [
        { path: "a.json", json: TRACE_JSON },
        { path: "b.json", json: TRACE_JSON },
      ],
    });

    expect(artifacts.summary).toBe(
      [
        "Translation: 2 traces into es, 2 glossary gaps",
        "  2 traces into de, 2 glossary gaps",
      ].join("\n"),
    );
  });

  test("translates nothing, loudly, when no locale was asked for", () => {
    const artifacts = run({ locales: [] });

    expect(artifacts.files).toStrictEqual([]);
    expect(artifacts.summary).toBe("Translation: no locales configured");
  });

  test("names the trace file it could not read", () => {
    expect(() => run({ traces: [{ path: "broken.json", json: "{]" }] })).toThrow(/broken\.json/);
  });

  test("fails the run rather than translating against an empty glossary", () => {
    expect(() => run({ glossaryJson: '{"schemaVersion":' })).toThrow(/not valid JSON/);
    expect(() =>
      run({ glossaryJson: '{"schemaVersion":1,"contexts":{},"terms":[],"x":1}' }),
    ).toThrow(TypeError);
  });

  test("reports one gap per phrase even when many traces share it", () => {
    const artifacts = run({
      traces: [
        { path: "a.json", json: TRACE_JSON },
        { path: "b.json", json: TRACE_JSON },
      ],
    });

    expect(artifacts.files.map((file) => file.gaps.map((gap) => gap.phrase))).toStrictEqual([
      ["amount", "payment"],
      ["amount", "payment"],
    ]);
    expect(artifacts.summary).toContain("2 glossary gaps");
  });
});
