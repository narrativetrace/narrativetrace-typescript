// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GlossaryArtifactSink } from "../src/glossary-suite-accumulator.js";
import { GlossarySuiteReporter, glossaryHarvestEnabled } from "../src/glossary-suite-reporter.js";

function fakeSink() {
  const written: Record<string, string> = {};
  const sink: GlossaryArtifactSink = {
    mkdir: () => {},
    writeFile: (path, content) => {
      written[path] = content;
    },
    fileExists: (path) => path in written,
    readFile: (path) => written[path] as string,
  };
  return { written, sink };
}

const FILES = [
  {
    tasks: [
      {
        meta: {
          narrativeGlossary: [
            {
              className: "OverdraftService",
              methodName: "openAccount",
              parameters: ["customerId"],
            },
          ],
        },
      },
    ],
  },
];

function reporterOver(fake: ReturnType<typeof fakeSink>, enabled: boolean, logged: string[]) {
  return new GlossarySuiteReporter({
    enabled,
    glossaryDir: ".",
    outputDir: "out",
    today: "2026-08-13",
    sink: fake.sink,
    log: (message) => logged.push(message),
  });
}

describe("glossaryHarvestEnabled", () => {
  test("is on only for the explicit opt-in", () => {
    expect(glossaryHarvestEnabled({ NARRATIVETRACE_GLOSSARY: "true" })).toBe(true);
    expect(glossaryHarvestEnabled({ NARRATIVETRACE_GLOSSARY: " TRUE " })).toBe(true);
  });

  test.each([
    ["an unset variable", undefined],
    ["an empty value", ""],
    ["a truthy-looking value that is not the opt-in", "1"],
    ["another truthy-looking value", "yes"],
    ["an explicit off", "false"],
  ])("is off for %s", (_case, value) => {
    // Harvesting rewrites files a repository commits, so anything short of the exact opt-in is off.
    expect(glossaryHarvestEnabled(value === undefined ? {} : { NARRATIVETRACE_GLOSSARY: value })) //
      .toBe(false);
  });
});

describe("GlossarySuiteReporter", () => {
  test("writes the glossary artifacts and prints the summary when switched on", () => {
    const fake = fakeSink();
    const logged: string[] = [];

    reporterOver(fake, true, logged).onFinished(FILES);

    expect(Object.keys(fake.written).sort()).toStrictEqual([
      "./glossary.json",
      "./glossary.md",
      "out/glossary-usage.json",
    ]);
    expect(logged.join("\n")).toContain("Vocabulary:");
  });

  test("writes nothing and prints nothing when switched off", () => {
    const fake = fakeSink();
    const logged: string[] = [];

    reporterOver(fake, false, logged).onFinished(FILES);

    expect(fake.written).toStrictEqual({});
    expect(logged).toStrictEqual([]);
  });

  test("is off when neither the option nor the environment says otherwise", () => {
    const fake = fakeSink();

    new GlossarySuiteReporter({ sink: fake.sink, log: () => {} }).onFinished(FILES);

    expect(fake.written).toStrictEqual({});
  });

  test("writes nothing for a suite that traced nothing", () => {
    const fake = fakeSink();
    const logged: string[] = [];

    reporterOver(fake, true, logged).onFinished([{ tasks: [{ meta: {} }] }]);

    expect(fake.written).toStrictEqual({});
    expect(logged).toStrictEqual([]);
  });

  test("writes nothing for a run with no files at all", () => {
    const fake = fakeSink();

    reporterOver(fake, true, []).onFinished();

    expect(fake.written).toStrictEqual({});
  });

  test("exposes the run's vocabulary issues for the clarity report", () => {
    const fake = fakeSink();
    const reporter = reporterOver(fake, true, []);

    reporter.onFinished(FILES);

    // Nothing is deprecated in a glossary this run just created, so there is nothing to flag yet.
    expect(reporter.issues).toStrictEqual([]);
  });

  test("writes the pair beside the working directory when no glossaryDir is given", () => {
    // Asserted through a sink: the default is `.`, and a real write would rewrite the glossary
    // of whichever repository is running the tests — exactly what the opt-in exists to prevent.
    const fake = fakeSink();

    new GlossarySuiteReporter({ enabled: true, sink: fake.sink, log: () => {} }).onFinished(FILES);

    expect(Object.keys(fake.written)).toContain("./glossary.json");
  });
});

/**
 * What a consumer gets from `reporters: ["default", new GlossarySuiteReporter()]` — no sink, no
 * logger, no date. Every test above supplies all three, so the production wiring (real filesystem
 * reads and writes, real stdout, today's date) was never exercised.
 */
describe("GlossarySuiteReporter with its shipped defaults", () => {
  let temp: string;

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), "nt-glossary-"));
  });

  afterEach(() => {
    rmSync(temp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function realReporter(options: { today?: string } = {}) {
    return new GlossarySuiteReporter({
      enabled: true,
      glossaryDir: join(temp, "repo"),
      outputDir: join(temp, "out"),
      log: () => {},
      ...options,
    });
  }

  test("creates both directories and writes all three artifacts to disk", () => {
    realReporter({ today: "2026-08-31" }).onFinished(FILES);

    const glossary = JSON.parse(readFileSync(join(temp, "repo", "glossary.json"), "utf-8"));
    expect(glossary.terms.map((t: { term: string }) => t.term)).toContain("open account");
    expect(existsSync(join(temp, "repo", "glossary.md"))).toBe(true);
    expect(existsSync(join(temp, "out", "glossary-usage.json"))).toBe(true);
  });

  test("reads the committed glossary back and files terms under its bounded context", () => {
    // The merge path: with a glossary already on disk, harvested terms must join its contexts
    // rather than restart in `_unassigned`. Only the real reader exercises this.
    seedGlossary(join(temp, "repo"));

    new GlossarySuiteReporter({
      enabled: true,
      glossaryDir: join(temp, "repo"),
      outputDir: join(temp, "out"),
      sourcePathOf: () => "packages/banking/src/overdraft-service.ts",
      today: "2026-08-31",
      log: () => {},
    }).onFinished(FILES);

    const glossary = JSON.parse(readFileSync(join(temp, "repo", "glossary.json"), "utf-8"));
    expect(glossary.terms.map((t: { context: string }) => t.context)).toStrictEqual(
      new Array(glossary.terms.length).fill("banking"),
    );
  });

  test("stamps today's UTC date on terms when no date is supplied", () => {
    realReporter().onFinished(FILES);

    const glossary = JSON.parse(readFileSync(join(temp, "repo", "glossary.json"), "utf-8"));
    const today = new Date().toISOString().slice(0, 10);
    expect(glossary.terms.every((t: { firstSeen: string }) => t.firstSeen === today)).toBe(true);
  });

  test("prints the summary to stdout as one newline-terminated line", () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });

    new GlossarySuiteReporter({
      enabled: true,
      glossaryDir: join(temp, "repo"),
      outputDir: join(temp, "out"),
      today: "2026-08-31",
    }).onFinished(FILES);

    expect(chunks.join("")).toBe("Vocabulary: 4 new terms harvested\n");
  });

  test("touches the filesystem not at all when harvesting is off", () => {
    new GlossarySuiteReporter({
      enabled: false,
      glossaryDir: join(temp, "repo"),
      outputDir: join(temp, "out"),
    }).onFinished(FILES);

    expect(existsSync(join(temp, "repo"))).toBe(false);
    expect(existsSync(join(temp, "out"))).toBe(false);
  });
});

/** A committed glossary declaring one bounded context, so context resolution has somewhere to go. */
function seedGlossary(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "glossary.json"),
    JSON.stringify({
      schemaVersion: 1,
      contexts: { banking: { packages: ["packages/banking"], description: "Accounts" } },
      terms: [],
    }),
    "utf-8",
  );
}
