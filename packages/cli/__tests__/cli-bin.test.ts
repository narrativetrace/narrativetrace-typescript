// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// cli-bin.ts is the actual `narrativetrace` executable: it runs its wiring at import time
// (parses argv, calls runCli, exits with its code), so this is the one place in the package that
// exercises that top-level wiring itself rather than the pure functions underneath it. Both
// dependencies are mocked; process.exit/stdout/stderr are spied so importing the module is safe.

const runCliMock = vi.fn();
vi.mock("../src/cli.js", () => ({ runCli: runCliMock }));
vi.mock("../src/doctor/environment.js", () => ({ buildSnapshot: vi.fn() }));

describe("cli-bin", () => {
  const originalArgv = process.argv;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    runCliMock.mockReset();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.argv = originalArgv;
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test("forwards argv with node and the script path stripped, and exits with runCli's code", async () => {
    process.argv = ["/usr/bin/node", "/path/to/narrativetrace", "doctor", "--json"];
    runCliMock.mockReturnValue(3);
    await import("../src/cli-bin.js");
    expect(runCliMock).toHaveBeenCalledWith(["doctor", "--json"], expect.any(Object));
    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  test("deps.log writes a newline-terminated line to stdout", async () => {
    process.argv = ["/usr/bin/node", "/path/to/narrativetrace"];
    runCliMock.mockImplementation((_argv: string[], deps: { log: (m: string) => void }) => {
      deps.log("hello");
      return 0;
    });
    await import("../src/cli-bin.js");
    expect(stdoutSpy).toHaveBeenCalledWith("hello\n");
  });

  test("deps.error writes a newline-terminated line to stderr", async () => {
    process.argv = ["/usr/bin/node", "/path/to/narrativetrace"];
    runCliMock.mockImplementation((_argv: string[], deps: { error: (m: string) => void }) => {
      deps.error("oops");
      return 2;
    });
    await import("../src/cli-bin.js");
    expect(stderrSpy).toHaveBeenCalledWith("oops\n");
  });
});
