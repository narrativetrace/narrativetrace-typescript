// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  type ConfigFileReader,
  DuplicateConfigurationError,
  readFileConfig,
  readProjectFile,
} from "../src/file-config.js";

/** In-memory project root: absent paths read as undefined, exactly like ENOENT. */
function files(entries: Record<string, string>): ConfigFileReader {
  return (path: string) => entries[path];
}

describe("readFileConfig", () => {
  test("resolves nothing when the project root holds no config source", () => {
    expect(readFileConfig("/proj", files({}))).toBeUndefined();
  });

  test("reads settings from narrativetrace.config.json", () => {
    const fs = files({ "/proj/narrativetrace.config.json": '{"level":"summary"}' });
    expect(readFileConfig("/proj", fs)).toEqual({ level: "summary" });
  });

  test("two config sources in one project root is a hard error, not silent precedence", () => {
    const fs = files({
      "/proj/narrativetrace.config.json": '{"level":"summary"}',
      "/proj/.narrativetracerc.json": '{"level":"off"}',
    });
    expect(() => readFileConfig("/proj", fs)).toThrow(DuplicateConfigurationError);
  });

  test("names every offending source in the duplicate error", () => {
    const fs = files({
      "/proj/narrativetrace.config.json": "{}",
      "/proj/.narrativetracerc.json": "{}",
    });
    expect(() => readFileConfig("/proj", fs)).toThrow(
      /narrativetrace\.config\.json, \.narrativetracerc\.json/,
    );
  });

  test("honors .narrativetracerc.json as the sole source", () => {
    const fs = files({ "/proj/.narrativetracerc.json": '{"level":"errors"}' });
    expect(readFileConfig("/proj", fs)).toEqual({ level: "errors" });
  });

  test("rejects malformed JSON with the offending path, rather than silently ignoring it", () => {
    const fs = files({ "/proj/narrativetrace.config.json": "{level: summary" });
    expect(() => readFileConfig("/proj", fs)).toThrow(/narrativetrace\.config\.json/);
  });

  test.each([
    ["an array", "[]"],
    ["a string", '"summary"'],
    ["null", "null"],
    ["a number", "3"],
  ])("rejects %s at the top level — config must be an object", (_label, json) => {
    const fs = files({ "/proj/narrativetrace.config.json": json });
    expect(() => readFileConfig("/proj", fs)).toThrow(/must be a JSON object/);
  });

  test("accepts an empty object as an explicit no-op configuration", () => {
    expect(readFileConfig("/proj", files({ "/proj/narrativetrace.config.json": "{}" }))).toEqual(
      {},
    );
  });
});

describe("readProjectFile — the real filesystem adapter", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-file-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads an existing file as UTF-8 text", () => {
    const path = join(dir, "narrativetrace.config.json");
    writeFileSync(path, '{"level":"summary"}', "utf-8");
    expect(readProjectFile(path)).toBe('{"level":"summary"}');
  });

  test("reports a missing file as absent rather than throwing", () => {
    expect(readProjectFile(join(dir, "nope.json"))).toBeUndefined();
  });

  test("propagates a non-ENOENT failure instead of reporting the config as absent", () => {
    // A directory where a file is expected is unreadable, NOT missing — treating it as absent
    // would silently drop a real configuration problem.
    expect(() => readProjectFile(dir)).toThrow();
  });

  test("round-trips through readFileConfig against a real project root", () => {
    writeFileSync(join(dir, ".narrativetracerc.json"), '{"level":"errors"}', "utf-8");
    expect(readFileConfig(dir, readProjectFile)).toEqual({ level: "errors" });
  });
});
