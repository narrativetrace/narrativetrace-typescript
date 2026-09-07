// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConfigFileReader } from "../src/file-config.js";
import { DuplicateConfigurationError } from "../src/file-config.js";
import { resolveConfig } from "../src/resolve-config.js";

function files(entries: Record<string, string>): ConfigFileReader {
  return (path: string) => entries[path];
}

const CONFIG = "/proj/narrativetrace.config.json";

describe("resolveConfig", () => {
  test("falls back to the default level with neither env nor file present", () => {
    expect(resolveConfig({ env: {}, projectRoot: "/proj", read: files({}) })).toEqual({
      level: "detail",
    });
  });

  test("takes settings from the config file when the env channel is silent", () => {
    expect(
      resolveConfig({
        env: {},
        projectRoot: "/proj",
        read: files({ [CONFIG]: '{"level":"summary","outputDir":"traces"}' }),
      }),
    ).toEqual({ level: "summary", outputDir: "traces" });
  });

  test("lets the env channel override the file, mirroring system-property precedence", () => {
    expect(
      resolveConfig({
        env: { NARRATIVETRACE_LEVEL: "off" },
        projectRoot: "/proj",
        read: files({ [CONFIG]: '{"level":"detail"}' }),
      }).level,
    ).toBe("off");
  });

  test("overrides only the keys the env channel actually sets", () => {
    expect(
      resolveConfig({
        env: { NARRATIVETRACE_LEVEL: "errors" },
        projectRoot: "/proj",
        read: files({ [CONFIG]: '{"level":"detail","format":"mermaid"}' }),
      }),
    ).toEqual({ level: "errors", format: "mermaid" });
  });

  test("degrades a garbage level in the file to the fallback, matching the env channel", () => {
    expect(
      resolveConfig({
        env: {},
        projectRoot: "/proj",
        read: files({ [CONFIG]: '{"level":"loud"}' }),
      }).level,
    ).toBe("detail");
  });

  test("ignores unknown keys in the config file", () => {
    expect(
      resolveConfig({
        env: {},
        projectRoot: "/proj",
        read: files({ [CONFIG]: '{"level":"summary","nonsense":true}' }),
      }),
    ).toEqual({ level: "summary" });
  });

  test("ignores non-string values for string-valued settings", () => {
    expect(
      resolveConfig({
        env: {},
        projectRoot: "/proj",
        read: files({ [CONFIG]: '{"outputDir":42,"format":["md"]}' }),
      }),
    ).toEqual({ level: "detail" });
  });

  test("propagates a duplicate-source failure instead of degrading to defaults", () => {
    const read = files({
      [CONFIG]: "{}",
      "/proj/.narrativetracerc.json": "{}",
    });
    expect(() => resolveConfig({ env: {}, projectRoot: "/proj", read })).toThrow(
      DuplicateConfigurationError,
    );
  });
});

describe("resolveConfig — default channels", () => {
  const savedEnv = { ...process.env };
  let projectRoot: string;

  beforeEach(() => {
    delete process.env.NARRATIVETRACE_LEVEL;
    projectRoot = mkdtempSync(join(tmpdir(), "nt-defaults-"));
    // Stubbing cwd rather than chdir: chdir is process-global and leaks across the worker.
    vi.spyOn(process, "cwd").mockReturnValue(projectRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
    process.env = { ...savedEnv };
  });

  test("with no arguments reads process.env, process.cwd() and the real filesystem", () => {
    writeFileSync(
      join(projectRoot, "narrativetrace.config.json"),
      '{"level":"summary","outputDir":"from-file"}',
      "utf-8",
    );
    expect(resolveConfig()).toEqual({ level: "summary", outputDir: "from-file" });
  });

  test("with no arguments lets the real env override the real file", () => {
    writeFileSync(join(projectRoot, "narrativetrace.config.json"), '{"level":"summary"}', "utf-8");
    process.env.NARRATIVETRACE_LEVEL = "off";
    expect(resolveConfig().level).toBe("off");
  });

  test("falls back to detail when the real project root has no config at all", () => {
    expect(resolveConfig()).toEqual({ level: "detail" });
  });
});

describe("public entry point", () => {
  test("re-exports the config-resolution surface a consumer needs", async () => {
    const pkg = await import("../src/index.js");
    expect(typeof pkg.resolveConfig).toBe("function");
    expect(typeof pkg.readProjectFile).toBe("function");
    expect(
      pkg.resolveConfig({
        env: {},
        projectRoot: "/proj",
        read: files({ [CONFIG]: '{"level":"summary"}' }),
      }).level,
    ).toBe("summary");
  });

  test("throws the exported error type, so consumers can catch it by class", async () => {
    const pkg = await import("../src/index.js");
    const read = files({ [CONFIG]: "{}", "/proj/.narrativetracerc.json": "{}" });
    expect(() => pkg.resolveConfig({ env: {}, projectRoot: "/proj", read })).toThrow(
      pkg.DuplicateConfigurationError,
    );
  });
});
