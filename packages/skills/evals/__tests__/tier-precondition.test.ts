// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { assertDeterministicTiersGreen } from "../tier-precondition.js";

describe("assertDeterministicTiersGreen", () => {
  it("passes through silently when the injected run command succeeds", () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    expect(() =>
      assertDeterministicTiersGreen("/repo", (command, args, cwd) => {
        calls.push({ command, args, cwd });
      }),
    ).not.toThrow();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("pnpm");
    expect(calls[0]?.cwd).toBe("/repo");
    expect(calls[0]?.args).toEqual([
      "--filter",
      "@narrativetrace/skills",
      "exec",
      "vitest",
      "run",
      "__tests__/lints.test.ts",
      "__tests__/replay.test.ts",
    ]);
  });

  it("refuses with a quota-preserving explanation when the injected run command throws", () => {
    const failing = () => {
      throw new Error("2 failed");
    };
    expect(() => assertDeterministicTiersGreen("/repo", failing)).toThrow(
      /refuses to start on top of a known defect/,
    );
  });

  it("preserves the underlying failure as the error's cause", () => {
    const underlying = new Error("2 failed");
    try {
      assertDeterministicTiersGreen("/repo", () => {
        throw underlying;
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).cause).toBe(underlying);
    }
  });
});
