// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  editsSource,
  inSource,
  shapeOf,
  shellWritesSource,
} from "../narrativetrace-debug/grade-the-debug.mjs";
import {
  callAndId,
  follows,
  hasNarrativeLine,
  isTestRun,
  promotes,
  runBehind,
} from "../trace-transcript.mjs";

const bash = (command: string, index = 0) => ({
  index,
  turn: 1,
  kind: "tool",
  payload: { name: "Bash", input: { command } },
});
const tool = (name: string, input: unknown, index = 0) => ({
  index,
  turn: 1,
  kind: "tool",
  payload: { name, input },
});
const result = (text: string, index = 0) => ({ index, turn: 1, kind: "result", payload: text });

describe("callAndId — a trace line's own call and id", () => {
  // Adversarial finding, FIXED: trace-transcript.mjs matches the call with `[\w$]+`, ASCII only, but the
  // feedback grammar and the renderer both accept Unicode identifiers (a project may name its code
  // in any script). A structural line for `注文.place(` is then not read as a trace line at all, so
  // the grader never sees the span it is looking for.
  it("reads a structural line whose class name is a non-Latin identifier", () => {
    expect(callAndId("#1.2 - 注文.place(id)")).toEqual(["注文.place", "#1.2"]);
  });

  it("reads the call and id from a numbered Read-tool line", () => {
    expect(callAndId("    12→#1.3 - A.b(x)")).toEqual(["A.b", "#1.3"]);
  });

  it("is null for a Markdown-looking call that does not end in a span id", () => {
    expect(callAndId("- `Order.place(id: 42)` returned value")).toBeNull();
    expect(hasNarrativeLine("- `Order.place(id: 42)` returned value")).toBe(false);
  });
});

describe("shapeOf — a narrative line's shape never carries a value's words", () => {
  // Adversarial finding, FIXED: the name extraction runs over the whole parameter text, values included, so
  // a value that itself contains ", word: " yields a name that is not a parameter. The shape then
  // differs between two runs whose values differ, which the debug grader reads as "something moved".
  it("a value containing a colon-separated word does not add a parameter name to the shape", () => {
    expect(shapeOf('- `Order.place(id: 42, note: "a, rate: 0.9")` → `"done"` #1.3')).toBe(
      "#1.3 Order.place(id, note)",
    );
  });
});

describe("shellWritesSource — which command writes production source", () => {
  // Adversarial finding, FIXED: after `cd src`, a relative target is taken as inside src unless it is
  // absolute, but its `..` is never resolved, so `../test/` (a sibling of src) is counted as a write
  // to src. The doc promises `..` is resolved before the check.
  it("a copy to the sibling test directory after cd src is not a write to src", () => {
    expect(shellWritesSource("cd src && cp x.js ../test/")).toBe(false);
  });

  it("a copy into the src directory itself is a write to src", () => {
    expect(shellWritesSource("cp /tmp/fixed.js src/")).toBe(true);
  });

  // Adversarial finding, FIXED: `rm` deletes a production file, which changes source as much as a rewrite
  // does, but commandWrites lists only sed, perl, tee, cp, mv, install, and git checkout/restore.
  it("removing a file under src is a change to production source", () => {
    expect(shellWritesSource("rm src/rate-table-converter.js")).toBe(true);
  });

  it("a checkout to another branch followed by a read of src is not a write", () => {
    expect(shellWritesSource("git checkout main && cat src/rate-table-converter.js")).toBe(false);
  });

  it("a directory that only begins with src is not src", () => {
    expect(shellWritesSource("echo x > src-old/notes.txt")).toBe(false);
    expect(inSource("src-old/x.js")).toBe(false);
    expect(inSource("-src")).toBe(false);
  });
});

describe("isTestRun and runBehind — which run the trace came from", () => {
  // Adversarial finding, FIXED: TEST_RUN matches the bare word `vitest` anywhere in the command, so reading
  // the config file `vitest.config.ts` counts as a test run, and runBehind can then pick a read as
  // the traced run.
  it("reading the vitest config file is not a test run", () => {
    expect(isTestRun(bash("cat vitest.config.ts"))).toBe(false);
  });

  // Adversarial finding, FIXED: the package-manager form only matches `pnpm test` or `pnpm run test`, so a
  // workspace filter flag (`pnpm -r test`, `pnpm --filter x test`) is not seen as a test run.
  it("a workspace-wide pnpm test run is a test run", () => {
    expect(isTestRun(bash("pnpm -r test"))).toBe(true);
  });

  it("the traced run is the last test run before the first structural read", () => {
    const events = [
      bash("pnpm test", 0),
      bash("vitest run", 2),
      result("#1 - A.b()", 4),
      bash("pnpm test", 6),
    ];
    expect(runBehind(events, 4)).toBe(2);
    expect(runBehind(events, null)).toBe(0);
    expect(runBehind([bash("ls", 0)], null)).toBeNull();
  });
});

describe("follows and promotes — ordering and what counts as pinning", () => {
  it("a call that only ever comes earlier does not follow the one it precedes", () => {
    expect(follows("Order.place(x)\nPayment.charge(y)", "Order.place", "Payment.charge")).toBe(
      false,
    );
    expect(follows("Order.place(x)\nPayment.charge(y)", "Payment.charge", "Order.place")).toBe(
      true,
    );
  });

  it("reading an approved baseline is not a promotion", () => {
    expect(promotes(bash("cat tests/x.approved.nt"))).toBe(false);
    expect(promotes(tool("Edit", { file_path: "tests/x.approved.nt.bak" }))).toBe(false);
  });

  it("copying a received trace over the approved one is a promotion", () => {
    expect(promotes(bash("cp /tmp/x.received.nt tests/x.approved.nt"))).toBe(true);
  });
});
