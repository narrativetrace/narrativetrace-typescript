// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// cli-bin.ts is the actual `narrativetrace` executable: it runs its wiring at import time
// (parses argv, calls runCli, exits with its code), so this is the one place in the package that
// exercises that top-level wiring itself rather than the pure functions underneath it. Both
// dependencies are mocked; process.exit/stdout/stderr are spied so importing the module is safe.

const runCliMock = vi.fn();
const openCarrierForMock = vi.fn();
const buildSnapshotMock = vi.fn();
vi.mock("../src/cli.js", () => ({ runCli: runCliMock }));
vi.mock("../src/carrier-locator.js", async () => {
  const actual = await vi.importActual<typeof import("../src/carrier-locator.js")>(
    "../src/carrier-locator.js",
  );
  return { ...actual, openCarrierFor: openCarrierForMock };
});
vi.mock("@narrativetrace/tooling", () => ({ buildSnapshot: buildSnapshotMock }));

describe("cli-bin", () => {
  const originalArgv = process.argv;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    runCliMock.mockReset();
    buildSnapshotMock.mockReset();
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

  // A rendered report brings its own trailing newline, so `print` must not add one: a plan's diff
  // through `log` would end every run with a blank line, and a JSON envelope with two.
  test("deps.print writes a rendered report verbatim", async () => {
    process.argv = ["/usr/bin/node", "/path/to/narrativetrace"];
    runCliMock.mockImplementation((_argv: string[], deps: { print: (t: string) => void }) => {
      deps.print("nothing to do.\n");
      return 0;
    });
    await import("../src/cli-bin.js");
    expect(stdoutSpy).toHaveBeenCalledWith("nothing to do.\n");
  });

  /**
   * The `gh` probe belongs to exactly one entry point, and this is it. Asserted as a wiring fact
   * and never CALLED: calling it would start a process, which is the one thing no test here does.
   */
  test("deps.ghAuthenticated is wired from the one module that holds the real probe", async () => {
    process.argv = ["/usr/bin/node", "/path/to/narrativetrace", "feedback", "gh"];
    const { ghAuthenticated } =
      await vi.importActual<typeof import("../src/gh-auth-probe.js")>("../src/gh-auth-probe.js");
    let wired: unknown;
    runCliMock.mockImplementation((_argv: string[], deps: { ghAuthenticated: unknown }) => {
      wired = deps.ghAuthenticated;
      return 1;
    });

    await import("../src/cli-bin.js");

    expect(wired).toBe(ghAuthenticated);
  });

  test("deps.openCarrier asks the locator about the process's own directory", async () => {
    process.argv = ["/usr/bin/node", "/path/to/narrativetrace", "init", "--from", "/carriers"];
    runCliMock.mockImplementation(
      (_argv: string[], deps: { openCarrier: (from?: string) => unknown }) => {
        deps.openCarrier("/carriers");
        return 0;
      },
    );
    await import("../src/cli-bin.js");
    expect(openCarrierForMock).toHaveBeenCalledWith(process.cwd(), "/carriers");
  });

  test("deps.buildSnapshot passes this package's own directory as the bundled fallback", async () => {
    process.argv = ["/usr/bin/node", "/path/to/narrativetrace", "doctor"];
    const { cliPackageDirectory } = await vi.importActual<
      typeof import("../src/carrier-locator.js")
    >("../src/carrier-locator.js");
    runCliMock.mockImplementation(
      (_argv: string[], deps: { buildSnapshot: (c: string, e: object) => unknown }) => {
        deps.buildSnapshot("/project", {});
        return 0;
      },
    );
    await import("../src/cli-bin.js");
    expect(buildSnapshotMock).toHaveBeenCalledWith("/project", {}, cliPackageDirectory());
  });
});
