// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { cleanSnapshot, snapshot } from "./fixture.js";

function deps(overrides: Partial<Parameters<typeof runCli>[1]> = {}) {
  return {
    cwd: "/project",
    env: {},
    buildSnapshot: () => cleanSnapshot(),
    log: vi.fn(),
    error: vi.fn(),
    ...overrides,
  };
}

describe("runCli", () => {
  test("prints usage and exits 2 with no command", () => {
    const d = deps();
    expect(runCli([], d)).toBe(2);
    // Distinguishes the "no verb at all" branch from the "unknown command" branch — both exit 2
    // and both call deps.error, so a mutant that skips the dedicated no-verb branch (falling
    // through to "Unknown command: undefined") would otherwise still pass a status-only assertion.
    const [printed] = (d.error as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(printed).toContain(
      "narrativetrace — one CLI over NarrativeTrace's open artifact formats",
    );
    expect(printed).toContain("Usage:");
    expect(printed).not.toContain("Unknown command");
  });

  test("--help prints usage and exits 0", () => {
    const d = deps();
    expect(runCli(["--help"], d)).toBe(0);
    expect(d.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "narrativetrace — one CLI over NarrativeTrace's open artifact formats",
      ),
    );
  });

  test("-h is an alias for --help at the top level", () => {
    const d = deps();
    expect(runCli(["-h"], d)).toBe(0);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  test("rejects an unknown command with exit 2", () => {
    const d = deps();
    expect(runCli(["view"], d)).toBe(2);
    expect(d.error).toHaveBeenCalledWith(expect.stringContaining("Unknown command: view"));
  });

  test("doctor --help exits 0", () => {
    const d = deps();
    expect(runCli(["doctor", "--help"], d)).toBe(0);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("narrativetrace doctor [--json]"));
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("Read-only."));
  });

  test("doctor -h is an alias for doctor --help", () => {
    const d = deps();
    expect(runCli(["doctor", "-h"], d)).toBe(0);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("narrativetrace doctor [--json]"));
  });

  test("rejects an unknown doctor argument with exit 2", () => {
    const d = deps();
    expect(runCli(["doctor", "--bogus"], d)).toBe(2);
    expect(d.error).toHaveBeenCalledWith(
      expect.stringContaining("Unknown argument(s) for doctor: --bogus"),
    );
  });

  test("joins multiple unknown doctor arguments with a comma", () => {
    const d = deps();
    expect(runCli(["doctor", "--bogus", "--also-bogus"], d)).toBe(2);
    expect(d.error).toHaveBeenCalledWith(
      expect.stringContaining("Unknown argument(s) for doctor: --bogus, --also-bogus"),
    );
  });

  test("exits 2 when the target has no readable package.json", () => {
    const d = deps({ buildSnapshot: () => snapshot({ rootPackageJson: undefined }) });
    expect(runCli(["doctor"], d)).toBe(2);
    expect(d.error).toHaveBeenCalledWith(expect.stringContaining("Could not run"));
  });

  test("runs the doctor and exits 0 on a clean project", () => {
    const d = deps();
    expect(runCli(["doctor"], d)).toBe(0);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("narrativetrace doctor"));
  });

  test("--json switches to machine-readable output", () => {
    const d = deps();
    runCli(["doctor", "--json"], d);
    const [printed] = (d.log as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(() => JSON.parse(printed)).not.toThrow();
  });

  test("exits 1 when the doctor finds a failure", () => {
    const d = deps({ buildSnapshot: () => snapshot({ nodeVersion: "16.0.0" }) });
    expect(runCli(["doctor"], d)).toBe(1);
  });
});
