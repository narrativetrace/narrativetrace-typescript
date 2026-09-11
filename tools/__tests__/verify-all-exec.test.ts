// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { CommandOutcome } from "../verify-all-exec.js";
import { extractJsonObject, withLogHint } from "../verify-all-exec.js";

describe("extractJsonObject", () => {
  test("finds a single-line object preceded by unrelated prose", () => {
    const output = 'The --json option is unstable.\n{"a":1,"b":{"c":2}}\n';
    expect(extractJsonObject(output)).toBe('{"a":1,"b":{"c":2}}');
  });

  test("finds a pretty-printed object whose opening brace is alone on its own line", () => {
    const output = '{\n  "a": 1,\n  "b": [1, 2, 3]\n}\nClarity gate failure: too many issues\n';
    const extracted = extractJsonObject(output);
    expect(extracted).not.toBeUndefined();
    expect(JSON.parse(extracted as string)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  test("a brace inside a string does not confuse the depth count", () => {
    const output = '{"message": "use { and } for blocks"}';
    expect(JSON.parse(extractJsonObject(output) as string)).toEqual({
      message: "use { and } for blocks",
    });
  });

  test("undefined when there is no object at all", () => {
    expect(extractJsonObject("no braces here")).toBeUndefined();
  });
});

function outcome(overrides: Partial<CommandOutcome> = {}): CommandOutcome {
  return { exitCode: 0, output: "", seconds: 1, logFile: "/tmp/x.log", ...overrides };
}

describe("withLogHint", () => {
  test("a clean pass keeps the note exactly as given, log path omitted", () => {
    expect(withLogHint("some context", outcome(), "passed")).toBe("some context");
    expect(withLogHint(null, outcome(), "passed")).toBeNull();
  });

  test("a non-passing status always appends the log path", () => {
    expect(withLogHint(null, outcome(), "failed")).toBe("full output: /tmp/x.log");
    expect(withLogHint("why it failed", outcome(), "failed")).toBe(
      "why it failed; full output: /tmp/x.log",
    );
  });
});
