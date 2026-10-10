// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registryProcessStarter, waitUntil } from "../registry-process.js";

const EVALS = join(import.meta.dirname, "..");

describe("waitUntil", () => {
  it("returns as soon as the condition holds, without pausing", () => {
    const pauses: number[] = [];
    expect(
      waitUntil(
        () => true,
        1000,
        (ms) => pauses.push(ms),
      ),
    ).toBe(true);
    expect(pauses).toEqual([]);
  });

  it("polls until the condition holds", () => {
    let calls = 0;
    const pauses: number[] = [];
    expect(
      waitUntil(
        () => ++calls === 3,
        1000,
        (ms) => pauses.push(ms),
      ),
    ).toBe(true);
    expect(pauses).toEqual([100, 100]);
  });

  it("gives up after the budget, with one last look", () => {
    const pauses: number[] = [];
    expect(
      waitUntil(
        () => false,
        300,
        (ms) => pauses.push(ms),
      ),
    ).toBe(false);
    expect(pauses).toEqual([100, 100, 100]);
  });
});

describe("registryProcessStarter — the real process", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nt-registry-process-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("starts the registry in its own process, waits for its npmrc, and stops it", async () => {
    const staging = join(dir, "staging", "package");
    mkdirSync(staging, { recursive: true });
    writeFileSync(
      join(staging, "package.json"),
      JSON.stringify({ name: "@narrativetrace/x", version: "1.0.0" }),
    );
    mkdirSync(join(dir, "tarballs"));
    execFileSync("tar", [
      "-czf",
      join(dir, "tarballs", "x.tgz"),
      "-C",
      join(dir, "staging"),
      "package",
    ]);
    const npmrc = join(dir, "npmrc");

    const stop = registryProcessStarter(EVALS)(join(dir, "tarballs"), npmrc);
    try {
      const url = readFileSync(npmrc, "utf-8").split("=")[1]?.trim() as string;
      const response = await fetch(`${url}@narrativetrace%2fx`);
      expect(response.status).toBe(200);
    } finally {
      stop();
    }
  }, 60_000);

  it("refuses, and leaves nothing running, when the registry never writes its npmrc", () => {
    mkdirSync(join(dir, "empty"));
    const npmrc = join(dir, "npmrc");
    expect(() => registryProcessStarter(EVALS)(join(dir, "empty"), npmrc)).toThrow(
      `no ${npmrc} after 30 s`,
    );
    expect(existsSync(npmrc)).toBe(false);
  }, 60_000);
});
