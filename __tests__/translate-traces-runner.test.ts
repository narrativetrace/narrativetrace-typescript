// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { beforeEach, describe, expect, test } from "vitest";
import {
  exportJson,
  methodSignature,
  parameterCapture,
  returned,
  traceNode,
  traceTree,
} from "../packages/core/src/index.js";
import {
  parseTranslateArgs,
  runTranslateTraces,
  type TranslateIo,
} from "../tools/translate-traces-runner.js";

const GLOSSARY = `{
  "schemaVersion": 1,
  "contexts": {
    "billing": { "packages": ["packages/billing"] }
  },
  "terms": [
    {
      "term": "charge",
      "context": "billing",
      "kind": "verb-phrase",
      "status": "curated",
      "translations": { "es": "cobrar" },
      "firstSeen": "2026-08-13"
    }
  ]
}
`;

const TRACE = exportJson(
  traceTree([
    traceNode(
      methodSignature("PaymentService", "charge", [parameterCapture("amount", "74.97", false)]),
      returned("true"),
      [],
    ),
  ]),
  { scenario: "charge succeeds" },
);

const SOURCE = `
export class PaymentService {
  charge(amount: number): boolean {
    return amount > 0;
  }
}
`;

let files: Map<string, string>;
let written: Map<string, string>;
let logs: string[];
let errors: string[];

const io: TranslateIo = {
  traceFiles: (dir) => [...files.keys()].filter((path) => path.startsWith(`${dir}/`)),
  sourceFiles: (dir) => (dir === "packages" ? ["packages/billing/payment-service.ts"] : []),
  readFile: (path) => {
    const content = files.get(path);
    if (content === undefined) throw new Error(`no such file: ${path}`);
    return content;
  },
  fileExists: (path) => files.has(path),
  writeFile: (path, content) => {
    written.set(path, content);
  },
  mkdir: () => {},
  log: (message) => logs.push(message),
  error: (message) => errors.push(message),
};

function options(overrides: Partial<Parameters<typeof runTranslateTraces>[0]> = {}) {
  return {
    traceDir: "narrativetrace-output",
    glossaryDir: ".",
    outputDir: "narrativetrace-output",
    locales: ["es"],
    ...overrides,
  };
}

beforeEach(() => {
  files = new Map([
    ["./glossary.json", GLOSSARY],
    ["narrativetrace-output/payment/charge_succeeds.json", TRACE],
    ["packages/billing/payment-service.ts", SOURCE],
  ]);
  written = new Map();
  logs = [];
  errors = [];
});

describe("parseTranslateArgs", () => {
  test("requires at least one locale", () => {
    expect(parseTranslateArgs([])).toBeUndefined();
    expect(parseTranslateArgs(["--locale"])).toBeUndefined();
    expect(parseTranslateArgs(["--locale", "--trace-dir"])).toBeUndefined();
  });

  test("reads a comma-separated locale list, in the order given", () => {
    expect(parseTranslateArgs(["--locale", "es,de"])?.locales).toStrictEqual(["es", "de"]);
  });

  test("defaults every directory to the layout a suite run leaves behind", () => {
    expect(parseTranslateArgs(["--locale", "es"])).toStrictEqual({
      traceDir: "narrativetrace-output",
      glossaryDir: ".",
      outputDir: "narrativetrace-output",
      locales: ["es"],
    });
  });

  test("takes each directory from its flag when given", () => {
    const parsed = parseTranslateArgs([
      "--locale",
      "es",
      "--trace-dir",
      "traces",
      "--glossary-dir",
      "config",
      "--output-dir",
      "out",
      "--source-dir",
      "packages",
    ]);

    expect(parsed).toStrictEqual({
      traceDir: "traces",
      glossaryDir: "config",
      outputDir: "out",
      sourceDir: "packages",
      locales: ["es"],
    });
  });
});

describe("runTranslateTraces", () => {
  test("writes one translated document per trace, mirroring the trace layout", () => {
    expect(runTranslateTraces(options({ sourceDir: "packages" }), io)).toBe(0);

    expect([...written.keys()]).toStrictEqual([
      "narrativetrace-output/traces-es/payment/charge_succeeds.md",
    ]);
    expect(written.values().next().value).toContain("cobrar [charge]");
  });

  test("reports what it translated and what curation it uncovered", () => {
    runTranslateTraces(options({ sourceDir: "packages" }), io);

    expect(logs[0]).toContain("Translation: 1 trace into es");
    expect(logs.at(-1)).toContain("narrativetrace-output/traces-es");
  });

  test("resolves no bounded context, and says so, when no source tree was given", () => {
    expect(runTranslateTraces(options(), io)).toBe(0);

    expect(written.values().next().value).not.toContain("cobrar");
    expect(logs.join("\n")).toContain("--source-dir");
  });

  test("warns when a source tree resolved every class outside the declared contexts", () => {
    runTranslateTraces(options({ sourceDir: "elsewhere" }), io);

    expect(logs.join("\n")).toContain("_unassigned");
    expect(logs.join("\n")).toContain("glossary.json");
  });

  test("stays quiet about contexts when the source tree did resolve them", () => {
    runTranslateTraces(options({ sourceDir: "packages" }), io);

    expect(logs.join("\n")).not.toContain("_unassigned");
  });

  test("refuses to translate a repository that has never harvested a glossary", () => {
    files.delete("./glossary.json");

    expect(runTranslateTraces(options(), io)).toBe(1);
    expect(errors.join("\n")).toContain("glossary.json");
  });

  test("skips the run's own report artifacts, which are not traces", () => {
    files.set("narrativetrace-output/glossary-usage.json", '{"newTerms":[]}');
    files.set("narrativetrace-output/clarity-results.json", "{}");

    expect(runTranslateTraces(options({ sourceDir: "packages" }), io)).toBe(0);
    expect([...written.keys()]).toHaveLength(1);
  });

  test("fails, naming the file, when a trace cannot be read", () => {
    files.set("narrativetrace-output/payment/broken.json", "{]");

    expect(runTranslateTraces(options(), io)).toBe(1);
    expect(errors.join("\n")).toContain("broken.json");
  });

  test("says so, and succeeds, when there is nothing to translate", () => {
    files.delete("narrativetrace-output/payment/charge_succeeds.json");

    expect(runTranslateTraces(options(), io)).toBe(0);
    expect(logs.join("\n")).toContain("No traces");
    expect(written.size).toBe(0);
  });
});
