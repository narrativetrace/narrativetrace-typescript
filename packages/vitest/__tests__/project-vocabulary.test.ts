// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyVocabulary, isDomainNoun, isDomainVerb } from "@narrativetrace/clarity";
import type { VocabularyFileReader } from "@narrativetrace/glossary";
import { beforeEach, describe, expect, test } from "vitest";
import {
  GLOSSARY_DIR_ENV,
  nodeFileReader,
  projectVocabulary,
  resetProjectVocabulary,
} from "../src/project-vocabulary.js";

const GLOSSARY_JSON = JSON.stringify({
  schemaVersion: 1,
  contexts: { trading: { packages: ["com.acme.trading"] } },
  terms: [
    {
      term: "fold tranche",
      context: "trading",
      kind: "verb-phrase",
      status: "curated",
      firstSeen: "2020-01-01",
    },
  ],
});

function reader(files: Record<string, string>): VocabularyFileReader {
  return {
    isFile: (path) => path in files,
    readText: (path) => files[path] as string,
    join: (...segments) => segments.join("/"),
  };
}

describe("projectVocabulary", () => {
  beforeEach(() => {
    resetProjectVocabulary();
  });

  test("reads the committed glossary from the configured directory", () => {
    const vocabulary = projectVocabulary(
      { [GLOSSARY_DIR_ENV]: "/repo" },
      reader({ "/repo/glossary.json": GLOSSARY_JSON }),
    );

    expect(isDomainVerb(vocabulary, "fold")).toBe(true);
    expect(isDomainNoun(vocabulary, "tranche")).toBe(true);
  });

  test("defaults to the working directory when the variable is unset", () => {
    const seen: string[] = [];
    projectVocabulary({}, { ...reader({}), isFile: (p) => (seen.push(p), false) });

    expect(seen).toEqual(["./glossary.json"]);
  });

  test("a repository with no committed glossary scores with the built-in dictionaries", () => {
    expect(projectVocabulary({ [GLOSSARY_DIR_ENV]: "/repo" }, reader({}))).toStrictEqual(
      emptyVocabulary,
    );
  });

  test("a malformed committed glossary degrades with a warning instead of failing the suite", () => {
    const warnings: string[] = [];

    const vocabulary = projectVocabulary(
      { [GLOSSARY_DIR_ENV]: "/repo" },
      reader({ "/repo/glossary.json": "{ not json" }),
      (message) => warnings.push(message),
    );

    expect(vocabulary).toStrictEqual(emptyVocabulary);
    expect(warnings.join("\n")).toContain("could not be read");
    expect(warnings.join("\n")).toContain("built-in dictionaries only");
  });

  test("is memoized per process, so a worker reads the glossary once", () => {
    let reads = 0;
    const counting: VocabularyFileReader = {
      ...reader({ "/repo/glossary.json": GLOSSARY_JSON }),
      readText: (path) => {
        reads++;
        return path === "/repo/glossary.json" ? GLOSSARY_JSON : "";
      },
    };

    projectVocabulary({ [GLOSSARY_DIR_ENV]: "/repo" }, counting);
    projectVocabulary({ [GLOSSARY_DIR_ENV]: "/repo" }, counting);

    expect(reads).toBe(1);
  });
});

describe("projectVocabulary against the real filesystem", () => {
  beforeEach(() => {
    resetProjectVocabulary();
  });

  test("reads a committed glossary written to a real directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-glossary-"));
    writeFileSync(join(dir, "glossary.json"), GLOSSARY_JSON);

    const vocabulary = projectVocabulary({ [GLOSSARY_DIR_ENV]: dir });

    expect(isDomainVerb(vocabulary, "fold")).toBe(true);
    expect(isDomainNoun(vocabulary, "tranche")).toBe(true);
  });

  test("a real directory without a glossary yields the empty vocabulary", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-glossary-"));

    expect(projectVocabulary({ [GLOSSARY_DIR_ENV]: dir })).toStrictEqual(emptyVocabulary);
  });

  test("a directory named like the glossary is not a glossary", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-glossary-"));
    mkdirSync(join(dir, "glossary.json"));

    expect(projectVocabulary({ [GLOSSARY_DIR_ENV]: dir })).toStrictEqual(emptyVocabulary);
  });

  test("the default warning channel is stderr", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-glossary-"));
    writeFileSync(join(dir, "glossary.json"), "{ not json");
    const written: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      expect(projectVocabulary({ [GLOSSARY_DIR_ENV]: dir })).toStrictEqual(emptyVocabulary);
    } finally {
      process.stderr.write = original;
    }

    expect(written.join("")).toContain("could not be read");
  });
});

describe("nodeFileReader", () => {
  test("names the environment variable the Gradle-plugin equivalent sets", () => {
    expect(GLOSSARY_DIR_ENV).toBe("NARRATIVETRACE_GLOSSARY_DIR");
  });

  test("a regular file is a file; a directory of the same name is not", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-glossary-"));
    writeFileSync(join(dir, "glossary.json"), GLOSSARY_JSON);
    mkdirSync(join(dir, "nested"));

    expect(nodeFileReader.isFile(join(dir, "glossary.json"))).toBe(true);
    expect(nodeFileReader.isFile(join(dir, "nested"))).toBe(false);
    expect(nodeFileReader.isFile(join(dir, "absent.json"))).toBe(false);
  });

  test("reads decoded text, not raw bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-glossary-"));
    writeFileSync(join(dir, "glossary.json"), GLOSSARY_JSON);

    const text = nodeFileReader.readText(join(dir, "glossary.json"));

    expect(typeof text).toBe("string");
    expect(text).toBe(GLOSSARY_JSON);
  });

  test("joins segments the way the host platform does", () => {
    expect(nodeFileReader.join("repo", "glossary.json")).toBe(join("repo", "glossary.json"));
  });
});

describe("a directory named like the glossary is silently not a glossary", () => {
  beforeEach(() => {
    resetProjectVocabulary();
  });

  test("no warning is emitted, because nothing failed to be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrativetrace-glossary-"));
    mkdirSync(join(dir, "glossary.json"));
    const warnings: string[] = [];

    const vocabulary = projectVocabulary({ [GLOSSARY_DIR_ENV]: dir }, nodeFileReader, (m) =>
      warnings.push(m),
    );

    expect(vocabulary).toStrictEqual(emptyVocabulary);
    expect(warnings).toEqual([]);
  });
});
