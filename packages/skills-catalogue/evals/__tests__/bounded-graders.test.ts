// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * A grader that calls `timeout N …` dies on macOS, which ships no GNU coreutils: on 2026-10-10 that
 * turned every init-prompt trial there into a harness verdict. The graders bound their commands
 * through `bounded.sh` instead — `timeout`, else `gtimeout`, else perl's alarm.
 */

const CASES = join(import.meta.dirname, "..", "add-narrative-tracing");
const BOUNDED = join(CASES, "bounded.sh");

let bin: string;
beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "nt-bounded-"));
});
afterEach(() => rmSync(bin, { recursive: true, force: true }));

/** A PATH holding only the named tools — no `timeout`, no `gtimeout`, as on a stock macOS. */
function pathWith(...tools: readonly string[]): string {
  for (const tool of tools) {
    const found = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
    symlinkSync(found, join(bin, tool));
  }
  return bin;
}

function bounded(path: string, command: string) {
  const run = spawnSync("/bin/sh", ["-c", `. "${BOUNDED}"; ${command}`], {
    env: { PATH: path },
    encoding: "utf8",
  });
  return { code: run.status, signal: run.signal };
}

describe("bounded.sh without GNU timeout", () => {
  it("runs a command that finishes in time and passes its status through", () => {
    const path = pathWith("perl", "sleep", "sh");
    expect(bounded(path, "bounded 5 sleep 0").code).toBe(0);
    expect(bounded(path, "bounded 5 sh -c 'exit 3'").code).toBe(3);
  });

  it("ends a command that outlives its bound, non-zero", () => {
    const path = pathWith("perl", "sleep");
    const started = Date.now();
    const run = bounded(path, "bounded 1 sleep 30");
    expect(run.code === 0 && run.signal === null).toBe(false);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("the graders' shell scripts", () => {
  function scripts(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sh"))
      .map((entry) => join(entry.parentPath, entry.name));
  }

  it("never call GNU timeout directly", () => {
    const direct = scripts(join(CASES, "..")).filter((path) =>
      /^\s*(?:[^#\n]*[\s=(`|&;])?timeout\s+\d/mu.test(readFileSync(path, "utf8")),
    );
    expect(direct).toEqual([]);
  });
});
