// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { beforeEach, describe, expect, test } from "vitest";
import { parseScanArgs, runGlossaryScan, type ScanIo } from "../tools/glossary-scan-runner.js";

/** An in-memory repository, so the scan is exercised without touching a real filesystem. */
function fakeIo(files: Record<string, string>) {
  const written: Record<string, string> = {};
  const logged: string[] = [];
  const errors: string[] = [];
  const io: ScanIo = {
    sourceFiles: (dir) => Object.keys(files).filter((path) => path.startsWith(`${dir}/`)),
    readFile: (path) => {
      const content = files[path] ?? written[path];
      if (content === undefined) throw new Error(`no such file: ${path}`);
      return content;
    },
    fileExists: (path) => path in files || path in written,
    writeFile: (path, content) => {
      written[path] = content;
    },
    mkdir: () => {},
    log: (message) => logged.push(message),
    error: (message) => errors.push(message),
  };
  return { io, written, logged, errors };
}

const OPTIONS = {
  sourceDir: "packages",
  glossaryDir: ".",
  outputDir: "narrativetrace-output",
  today: "2026-08-13",
};

const SERVICE = `
  export class OverdraftService {
    @narrated("Charges {amount} to the account")
    charge(amount: number) {}
  }
`;

describe("parseScanArgs", () => {
  test("reads every path argument", () => {
    expect(
      parseScanArgs(["--source-dir", "src", "--glossary-dir", "docs", "--output-dir", "out"]),
    ).toMatchObject({ sourceDir: "src", glossaryDir: "docs", outputDir: "out" });
  });

  test("defaults the glossary to the repository root and the report to the output dir", () => {
    expect(parseScanArgs(["--source-dir", "src"])).toMatchObject({
      glossaryDir: ".",
      outputDir: "narrativetrace-output",
    });
  });

  test("rejects a run with no source directory, which has nothing to scan", () => {
    expect(parseScanArgs([])).toBeUndefined();
  });

  test("rejects a flag given with no value after it", () => {
    expect(parseScanArgs(["--source-dir"])).toBeUndefined();
  });
});

describe("runGlossaryScan", () => {
  let fake: ReturnType<typeof fakeIo>;

  beforeEach(() => {
    fake = fakeIo({ "packages/billing/overdraft-service.ts": SERVICE });
  });

  test("writes the committed glossary pair and the volatile usage report", () => {
    const code = runGlossaryScan(OPTIONS, fake.io);

    expect(code).toBe(0);
    expect(Object.keys(fake.written).sort()).toStrictEqual([
      "./glossary.json",
      "./glossary.md",
      "narrativetrace-output/glossary-usage.json",
    ]);
  });

  test("harvests the narration template, which only a static scan may read", () => {
    runGlossaryScan(OPTIONS, fake.io);

    expect(JSON.parse(fake.written["./glossary.json"] as string).terms).toContainEqual(
      expect.objectContaining({ term: "Charges {amount} to the account", kind: "template" }),
    );
  });

  test("merges into the glossary the repository already committed", () => {
    runGlossaryScan(OPTIONS, fake.io);
    const first = fake.written["./glossary.json"] as string;

    // A second scan of unchanged sources must not churn the committed file, even on a later date.
    const code = runGlossaryScan({ ...OPTIONS, today: "2026-09-01" }, fake.io);

    expect(code).toBe(0);
    expect(fake.written["./glossary.json"]).toBe(first);
  });

  test("prints the vocabulary summary and where the glossary went", () => {
    runGlossaryScan(OPTIONS, fake.io);

    expect(fake.logged.join("\n")).toContain("Vocabulary:");
    expect(fake.logged.join("\n")).toContain("./glossary.json");
  });

  test("writes nothing when the source directory holds no vocabulary", () => {
    const empty = fakeIo({});

    const code = runGlossaryScan(OPTIONS, empty.io);

    expect(code).toBe(0);
    expect(empty.written).toStrictEqual({});
    expect(empty.logged.join("\n")).toContain("No source found in packages");
  });

  test("reports an unreadable committed glossary instead of overwriting it", () => {
    const broken = fakeIo({
      "packages/billing/overdraft-service.ts": SERVICE,
      "./glossary.json": "{ not json",
    });

    const code = runGlossaryScan(OPTIONS, broken.io);

    // Failing here is the point: the next step would have rewritten the file without whatever
    // curated definitions it held.
    expect(code).toBe(1);
    expect(broken.errors.join("\n")).toContain("Error:");
    expect(broken.written).toStrictEqual({});
  });

  test("reports a failed write rather than exiting zero on a half-written glossary", () => {
    const readOnly = fakeIo({ "packages/billing/overdraft-service.ts": SERVICE });
    readOnly.io.writeFile = () => {
      throw new Error("read-only file system");
    };

    expect(runGlossaryScan(OPTIONS, readOnly.io)).toBe(1);
    expect(readOnly.errors.join("\n")).toContain("read-only file system");
  });

  test("skips a source file that declares no vocabulary at all", () => {
    const constants = fakeIo({ "packages/billing/limits.ts": "export const MAX = 10;" });

    expect(runGlossaryScan(OPTIONS, constants.io)).toBe(0);
    expect(constants.logged.join("\n")).toContain("No source found in packages");
  });
});
