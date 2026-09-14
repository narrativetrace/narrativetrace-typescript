// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDeterministicTiersGreen,
  preconditionCommand,
  runCommand,
} from "../tier-precondition.js";

describe("runCommand (the real, non-injected implementation)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-runcommand-"));
    writeFileSync(join(dir, "marker.txt"), "");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs a real process and does not throw on a zero exit", () => {
    expect(() => runCommand(process.execPath, ["-e", "1"], process.cwd())).not.toThrow();
  });

  it("throws when the process exits nonzero", () => {
    expect(() => runCommand(process.execPath, ["-e", "process.exit(1)"], process.cwd())).toThrow();
  });

  it("actually runs in the given cwd (a relative-path command sees that directory's files)", () => {
    expect(() => runCommand("sh", ["-c", "test -f marker.txt"], dir)).not.toThrow();
  });

  it("does NOT run in process.cwd() when a different cwd is given", () => {
    expect(() => runCommand("sh", ["-c", "test -f marker.txt"], tmpdir())).toThrow();
  });
});

const LINTS_AND_REPLAY = [
  "--filter",
  "@narrativetrace/skills",
  "exec",
  "vitest",
  "run",
  "__tests__/lints.test.ts",
  "__tests__/replay.test.ts",
];

describe("preconditionCommand", () => {
  it("runs the suite locally, unprefixed, when the toolchain-exec prefix is absent", () => {
    expect(preconditionCommand(undefined)).toEqual({
      command: "pnpm",
      args: LINTS_AND_REPLAY,
      where: "locally",
    });
  });

  it("runs the suite locally when the toolchain-exec prefix is the empty string", () => {
    expect(preconditionCommand("").where).toBe("locally");
  });

  it("prepends the toolchain-exec prefix's tokens to the argv when present", () => {
    expect(preconditionCommand("docker exec -w /workspace narrativetrace-dev")).toEqual({
      command: "docker",
      args: ["exec", "-w", "/workspace", "narrativetrace-dev", "pnpm", ...LINTS_AND_REPLAY],
      where: "via `docker exec -w /workspace narrativetrace-dev`",
    });
  });

  it("tokenises a quoted span in the prefix as one argv element", () => {
    const result = preconditionCommand('docker exec -w "/workspace with spaces" nt-dev');
    expect(result.command).toBe("docker");
    expect(result.args.slice(0, 4)).toEqual(["exec", "-w", "/workspace with spaces", "nt-dev"]);
  });
});

describe("assertDeterministicTiersGreen", () => {
  it("passes through silently when the injected run command succeeds", () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    expect(() =>
      assertDeterministicTiersGreen(
        "/repo",
        (command, args, cwd) => {
          calls.push({ command, args, cwd });
        },
        undefined,
      ),
    ).not.toThrow();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("pnpm");
    expect(calls[0]?.cwd).toBe("/repo");
    expect(calls[0]?.args).toEqual(LINTS_AND_REPLAY);
  });

  it("runs through the toolchain-exec prefix when given one explicitly", () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    assertDeterministicTiersGreen(
      "/repo",
      (command, args) => {
        calls.push({ command, args });
      },
      "docker exec -w /workspace narrativetrace-dev",
    );
    expect(calls[0]?.command).toBe("docker");
    expect(calls[0]?.args).toEqual([
      "exec",
      "-w",
      "/workspace",
      "narrativetrace-dev",
      "pnpm",
      ...LINTS_AND_REPLAY,
    ]);
  });

  it("refuses with a message naming 'locally' when the toolchain-exec prefix is absent", () => {
    const failing = () => {
      throw new Error("2 failed");
    };
    expect(() => assertDeterministicTiersGreen("/repo", failing, undefined)).toThrow(
      "Tier A lints / Tier A2 replay are not green (ran locally) for @narrativetrace/skills — a " +
        "sporadic-lane (codex/gemini) trial refuses to start on top of a known defect. Fix " +
        "packages/skills' own tests before spending quota here.",
    );
  });

  it("refuses with a message naming the toolchain-exec prefix when one is set", () => {
    const failing = () => {
      throw new Error("2 failed");
    };
    expect(() =>
      assertDeterministicTiersGreen(
        "/repo",
        failing,
        "docker exec -w /workspace narrativetrace-dev",
      ),
    ).toThrow(
      "Tier A lints / Tier A2 replay are not green (ran via `docker exec -w /workspace " +
        "narrativetrace-dev`) for @narrativetrace/skills — a sporadic-lane (codex/gemini) trial " +
        "refuses to start on top of a known defect. Fix packages/skills' own tests before " +
        "spending quota here.",
    );
  });

  it("preserves the underlying failure as the error's cause", () => {
    const underlying = new Error("2 failed");
    try {
      assertDeterministicTiersGreen(
        "/repo",
        () => {
          throw underlying;
        },
        undefined,
      );
      expect.unreachable();
    } catch (error) {
      expect((error as Error).cause).toBe(underlying);
    }
  });
});
