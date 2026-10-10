// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnInherit } from "../runner.js";

/**
 * The transcript capture proven at the real OS process boundary: a fake spawn that "captured" into a
 * string would prove nothing about a child's file descriptors.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-spawn-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("spawnInherit with a transcript", () => {
  it("APPENDS the child's standard output after what the transcript already holds", () => {
    const transcript = join(dir, "transcript.jsonl");
    writeFileSync(transcript, '{"nt_turn":1}\n');
    spawnInherit("sh", ["-c", "echo agent-line"], dir, {}, transcript);
    expect(readFileSync(transcript, "utf8")).toBe('{"nt_turn":1}\nagent-line\n');
  });

  it("gives a recorded child no standard input, so a CLI that reads a pipe cannot wait on one", () => {
    const transcript = join(dir, "transcript.jsonl");
    spawnInherit("sh", ["-c", "cat; echo done"], dir, {}, transcript);
    expect(readFileSync(transcript, "utf8")).toBe("done\n");
  });

  it("hands the child the environment it was given on top of the ambient one", () => {
    const transcript = join(dir, "transcript.jsonl");
    spawnInherit("sh", ["-c", 'echo "$NT_PROBE"'], dir, { NT_PROBE: "seen" }, transcript);
    expect(readFileSync(transcript, "utf8")).toBe("seen\n");
  });

  it("still throws on a non-zero exit, after appending what the child did print", () => {
    const transcript = join(dir, "transcript.jsonl");
    expect(() => spawnInherit("sh", ["-c", "echo partial; exit 3"], dir, {}, transcript)).toThrow();
    expect(readFileSync(transcript, "utf8")).toBe("partial\n");
  });
});
