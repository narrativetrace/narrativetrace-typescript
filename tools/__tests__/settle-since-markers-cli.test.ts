// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSettle } from "../settle-since-markers-cli.js";

describe("runSettle", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "settle-since-markers-cli-test-"));
    mkdirSync(join(root, "documentation"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("settles and reports the count and files when the version is present on the registry (green)", async () => {
    const guide = join(root, "documentation", "guide.md");
    writeFileSync(guide, "Shipped. *(since 0.1.3, unreleased)*\n");

    const result = await runSettle(root, "0.1.3", {
      fetchStatus: async () => 200,
    });

    expect(result.exitCode).toBe(0);
    expect(result.changed).toEqual([join("documentation", "guide.md")]);
    expect(result.message).toContain("1 file(s) settled for 0.1.3");
    expect(readFileSync(guide, "utf-8")).toBe("Shipped. *(since 0.1.3)*\n");
  });

  it("refuses and writes nothing when the version is not present on the registry (red)", async () => {
    const guide = join(root, "documentation", "guide.md");
    const before = "Shipped. *(since 0.1.3, unreleased)*\n";
    writeFileSync(guide, before);

    const result = await runSettle(root, "0.1.3", {
      fetchStatus: async () => 404,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("REFUSED");
    expect(result.message).toContain("not on the registry");
    expect(result.changed).toEqual([]);
    expect(readFileSync(guide, "utf-8")).toBe(before); // untouched — never runs ahead of the publish
  });

  it("refuses when the registry is unreachable, the same as an absent version (red)", async () => {
    const result = await runSettle(root, "0.1.3", {
      fetchStatus: async () => 0,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("REFUSED");
  });

  it("refuses when the version is present but zero markers were found — nothing to settle is a mistake (red)", async () => {
    writeFileSync(join(root, "documentation", "guide.md"), "Nothing here.\n");

    const result = await runSettle(root, "0.1.3", {
      fetchStatus: async () => 200,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("REFUSED");
    expect(result.message).toContain("nothing to settle is a mistake");
  });

  it("queries the exact package/version URL, not just the latest dist-tag", async () => {
    writeFileSync(
      join(root, "documentation", "guide.md"),
      "Shipped. *(since 0.1.3, unreleased)*\n",
    );
    const requestedUrls: string[] = [];

    await runSettle(root, "0.1.3", {
      fetchStatus: async (url) => {
        requestedUrls.push(url);
        return 200;
      },
    });

    expect(requestedUrls).toEqual(["https://registry.npmjs.org/@narrativetrace/core/0.1.3"]);
  });
});
