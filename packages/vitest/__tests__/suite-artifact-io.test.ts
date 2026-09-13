// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nodeFsArtifactSink, whenNonEmpty } from "../src/suite-artifact-io.js";

describe("whenNonEmpty", () => {
  test("runs body and returns its result for a non-empty list", () => {
    const result = whenNonEmpty(["a", "b"], () => ({ written: true, count: 2 }));
    expect(result).toEqual({ written: true, count: 2 });
  });

  test("returns { written: false } without running body for an empty list", () => {
    let ran = false;
    const result = whenNonEmpty([], () => {
      ran = true;
      return { written: true };
    });
    expect(result).toEqual({ written: false });
    expect(ran).toBe(false);
  });
});

describe("nodeFsArtifactSink", () => {
  let temp: string;

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), "nt-artifact-sink-"));
  });

  afterEach(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  test("mkdir creates nested directories", () => {
    const dir = join(temp, "a", "b");
    nodeFsArtifactSink().mkdir(dir);
    expect(existsSync(dir)).toBe(true);
  });

  test("writeFile writes UTF-8 content", () => {
    const file = join(temp, "out.txt");
    nodeFsArtifactSink().writeFile(file, "hello");
    expect(readFileSync(file, "utf-8")).toBe("hello");
  });
});
