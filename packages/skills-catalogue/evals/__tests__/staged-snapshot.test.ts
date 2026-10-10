// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { REGISTRY_SURFACE, stagingCommands } from "../staged-snapshot.js";

/**
 * The tree a registry reads: this repository's registry surface as a clone of the public repository
 * would show it. Every assertion here is about a property a trial's verdict depends on — what is
 * staged, which revision it comes from, and where the intermediate tarball lands.
 */

describe("REGISTRY_SURFACE", () => {
  it("is the plugin marketplace file and both rendered page flavours, and nothing else", () => {
    expect(REGISTRY_SURFACE).toEqual([".claude-plugin", ".claude/skills", ".agents/skills"]);
  });
});

describe("stagingCommands", () => {
  it("archives the registry surface out of HEAD, pointing git at the repository with -C", () => {
    const [archive] = stagingCommands("/repo", "/work/staged");

    expect(archive).toEqual([
      "git",
      "-C",
      "/repo",
      "archive",
      "--format=tar",
      "-o",
      "/work/staged.tar",
      "HEAD",
      "--",
      ".claude-plugin",
      ".claude/skills",
      ".agents/skills",
    ]);
  });

  it("unpacks that archive into the staged tree, and nothing else", () => {
    const commands = stagingCommands("/repo", "/work/staged");

    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(["tar", "-xf", "/work/staged.tar", "-C", "/work/staged"]);
  });

  it("puts the tarball BESIDE the staged tree, so a registry tool scanning it finds no tarball", () => {
    const [archive, unpack] = stagingCommands("/repo", "/work/staged");
    const tarball = archive?.[archive.indexOf("-o") + 1] as string;

    expect(tarball).toBe("/work/staged.tar");
    expect(tarball.startsWith(`${unpack?.[unpack.indexOf("-C") + 1]}/`)).toBe(false);
  });

  it("names HEAD, never the working tree — a registry serves what was committed", () => {
    const [archive] = stagingCommands("/repo", "/work/staged");

    expect(archive).toContain("HEAD");
    expect(archive?.filter((token) => token === "HEAD")).toHaveLength(1);
  });

  it("keeps the surface paths behind `--`, so a path can never be read as a revision", () => {
    const [archive] = stagingCommands("/repo", "/work/staged");
    const separator = (archive as readonly string[]).indexOf("--");

    expect(separator).toBeGreaterThan(-1);
    expect((archive as readonly string[]).slice(separator + 1)).toEqual([...REGISTRY_SURFACE]);
  });

  it("stages a nested work directory's tree beside itself, not beside its parent", () => {
    const [archive] = stagingCommands("/repo", "/work/trial-3/staged");

    expect(archive).toContain("/work/trial-3/staged.tar");
  });

  it("is argv all the way down — no element is a shell line", () => {
    for (const command of stagingCommands("/repo with spaces", "/work/staged")) {
      expect(Array.isArray(command)).toBe(true);
      for (const token of command) expect(token).not.toMatch(/[;&|><$`]/);
    }
  });
});
