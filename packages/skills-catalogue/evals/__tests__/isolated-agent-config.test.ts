// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configDir,
  npmCacheDir,
  npmrcPath,
  realConfigDir,
  registryEnv,
  seedLogin,
  VENDOR_CONFIG_DIR_VARIABLE,
} from "../isolated-agent-config.js";

/**
 * The throwaway vendor configuration a registry trial owns, in both directions: its installs never
 * reach the configuration of the person running it, and it never inherits that person's skills,
 * plugins or history either. The one thing copied IN is the subscription login, because a fresh
 * configuration is a logged-out one.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nt-config-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A stand-in for the real configuration directory: a login plus everything else that lives there. */
function fakeRealConfig(): string {
  const real = join(root, "real");
  mkdirSync(join(real, "projects"), { recursive: true });
  mkdirSync(join(real, "sessions"), { recursive: true });
  writeFileSync(join(real, ".credentials.json"), '{"token":"not-a-real-token"}');
  writeFileSync(join(real, ".claude.json"), '{"history":["something private"]}');
  writeFileSync(join(real, "settings.json"), '{"theme":"dark"}');
  return real;
}

describe("the directories a trial owns", () => {
  it("keeps the configuration and the package cache inside the work directory", () => {
    expect(configDir("/work")).toBe("/work/config");
    expect(npmCacheDir("/work")).toBe("/work/npm-cache");
  });
});

describe("registryEnv", () => {
  it("points the vendor CLI's own configuration override at the trial's directory", () => {
    expect(registryEnv("/work")[VENDOR_CONFIG_DIR_VARIABLE]).toBe("/work/config");
  });

  it("gives the package runner a writable cache and opts out of telemetry", () => {
    expect(registryEnv("/work")).toMatchObject({
      npm_config_cache: "/work/npm-cache",
      DO_NOT_TRACK: "1",
    });
  });

  it("points npm at the trial's own user configuration, never the operator's ~/.npmrc", () => {
    expect(registryEnv("/work").NPM_CONFIG_USERCONFIG).toBe("/work/npmrc");
    expect(npmrcPath("/work")).toBe("/work/npmrc");
  });

  it("carries exactly those four entries — a fifth would outlive the trial unnoticed", () => {
    expect(Object.keys(registryEnv("/work")).sort()).toEqual(
      [
        "DO_NOT_TRACK",
        VENDOR_CONFIG_DIR_VARIABLE,
        "npm_config_cache",
        "NPM_CONFIG_USERCONFIG",
      ].sort(),
    );
  });

  it("is a fresh object each call, so a caller may add to it without reaching the next trial", () => {
    const first = registryEnv("/work");
    first.DO_NOT_TRACK = "0";

    expect(registryEnv("/work").DO_NOT_TRACK).toBe("1");
  });

  it("names nothing outside the work directory — every value a trial's delete takes with it", () => {
    for (const [key, value] of Object.entries(registryEnv("/work"))) {
      if (key === "DO_NOT_TRACK") continue;
      expect(value.startsWith("/work/")).toBe(true);
    }
  });
});

describe("realConfigDir — where the login is read FROM", () => {
  it("honours the ambient override before anything else", () => {
    expect(realConfigDir("/elsewhere/config", "/home/dev", "/home/dev")).toBe("/elsewhere/config");
  });

  it("asks HOME before the runtime's own user home", () => {
    expect(realConfigDir(undefined, "/home/dev", "/a/different/home")).toBe("/home/dev/.claude");
  });

  it("REGRESSION: a runtime home of `?` never wins over a real HOME (the container's uid has no passwd entry)", () => {
    expect(realConfigDir(undefined, "/home/dev", "?")).toBe("/home/dev/.claude");
  });

  it("falls back to the runtime's user home when HOME is absent or blank", () => {
    expect(realConfigDir(undefined, undefined, "/runtime/home")).toBe("/runtime/home/.claude");
    expect(realConfigDir(undefined, "   ", "/runtime/home")).toBe("/runtime/home/.claude");
  });

  it("treats a blank override as no override at all", () => {
    expect(realConfigDir("  ", "/home/dev", "/runtime/home")).toBe("/home/dev/.claude");
  });
});

describe("seedLogin", () => {
  it("copies the subscription login into the trial's configuration and says it did", () => {
    const work = join(root, "work");

    expect(seedLogin(fakeRealConfig(), work)).toBe(true);
    expect(readdirSync(configDir(work))).toEqual([".credentials.json"]);
  });

  it("reads the login and NOTHING else of the real configuration", () => {
    const work = join(root, "work");
    seedLogin(fakeRealConfig(), work);

    const copied = readdirSync(configDir(work));
    expect(copied).not.toContain(".claude.json");
    expect(copied).not.toContain("projects");
    expect(copied).not.toContain("sessions");
    expect(copied).not.toContain("settings.json");
  });

  it("writes nothing back into the real configuration", () => {
    const real = fakeRealConfig();
    const before = readdirSync(real).sort();

    seedLogin(real, join(root, "work"));

    expect(readdirSync(real).sort()).toEqual(before);
  });

  it("leaves the copy readable by its owner alone — it is a credential", () => {
    const work = join(root, "work");
    seedLogin(fakeRealConfig(), work);

    const mode = statSync(join(configDir(work), ".credentials.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("still creates the configuration and cache directories when there is no login, and says so", () => {
    const work = join(root, "work");
    const empty = join(root, "empty");
    mkdirSync(empty, { recursive: true });

    expect(seedLogin(empty, work)).toBe(false);
    expect(statSync(configDir(work)).isDirectory()).toBe(true);
    expect(statSync(npmCacheDir(work)).isDirectory()).toBe(true);
  });

  it("reports false when something that is not a FILE sits where the login belongs", () => {
    const real = join(root, "real-with-a-directory");
    mkdirSync(join(real, ".credentials.json"), { recursive: true });

    expect(seedLogin(real, join(root, "work"))).toBe(false);
  });

  it("reports false rather than throwing when the real configuration does not exist at all", () => {
    expect(seedLogin(join(root, "nowhere"), join(root, "work"))).toBe(false);
  });

  it("is repeatable — a second seeding overwrites its own copy", () => {
    const work = join(root, "work");
    const real = fakeRealConfig();

    expect(seedLogin(real, work)).toBe(true);
    expect(seedLogin(real, work)).toBe(true);
  });
});
