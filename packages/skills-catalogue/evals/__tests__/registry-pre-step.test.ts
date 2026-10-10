// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { MARKETPLACE } from "../../src/catalogue-index.js";
import {
  isRegistryPreStep,
  preStepCommands,
  REGISTRY_PRE_STEPS,
  registryCommands,
} from "../registry-pre-step.js";
import { REGISTRY_SURFACE } from "../staged-snapshot.js";

/**
 * The closed vocabulary of registry deliveries a case may declare, and the exact argv each one
 * amounts to. A case file is data, and data that can name any executable is a shell this harness
 * does not have — so the vocabulary is asserted member by member, and an id outside it is refused.
 */

describe("REGISTRY_PRE_STEPS", () => {
  it("is exactly the two registries this port documents and replays", () => {
    expect(REGISTRY_PRE_STEPS).toEqual(["claude-marketplace", "npx-skills"]);
  });

  it("accepts its own members and nothing else", () => {
    for (const id of REGISTRY_PRE_STEPS) expect(isRegistryPreStep(id)).toBe(true);
    for (const id of ["", "gemini-skills", "npx skills", "claude", "NPX-SKILLS"]) {
      expect(isRegistryPreStep(id)).toBe(false);
    }
  });
});

describe("registryCommands — the documented lines, verbatim", () => {
  it("adds the marketplace from the staged tree, installs its one plugin, and reads the install back", () => {
    const plugin = MARKETPLACE.name;

    expect(registryCommands("claude-marketplace", "/work/staged")).toEqual([
      ["claude", "plugin", "marketplace", "add", "/work/staged"],
      ["claude", "plugin", "install", `${plugin}@${plugin}`],
      ["claude", "plugin", "details", `${plugin}@${plugin}`],
    ]);
  });

  it("names the plugin out of the catalogue, never as a literal of its own", () => {
    const [, install] = registryCommands("claude-marketplace", "/work/staged");

    expect(install?.at(-1)).toBe(`${MARKETPLACE.name}@${MARKETPLACE.name}`);
  });

  it("runs `npx skills add` against the staged tree, answering its prompts", () => {
    expect(registryCommands("npx-skills", "/work/staged")).toEqual([
      ["npx", "--yes", "skills", "add", "/work/staged", "-y"],
    ]);
  });

  it("leaves the npx package UNPINNED on purpose — a pinned replay cannot see a tool change", () => {
    const [add] = registryCommands("npx-skills", "/work/staged");

    expect(add).toContain("skills");
    for (const token of add as readonly string[]) expect(token).not.toMatch(/skills@/);
  });

  it("is argv all the way down for every member of the vocabulary", () => {
    for (const preStep of REGISTRY_PRE_STEPS) {
      for (const command of registryCommands(preStep, "/work/staged")) {
        expect(command.length).toBeGreaterThan(1);
        for (const token of command) expect(token).not.toMatch(/[;&|><$`]/);
      }
    }
  });
});

describe("preStepCommands — staging first, the registry's own lines after", () => {
  it("stages HEAD's registry surface before the tool that reads it runs", () => {
    const commands = preStepCommands("npx-skills", "/repo", "/work/staged");

    expect(commands[0]?.[0]).toBe("git");
    expect(commands[0]).toContain("HEAD");
    expect(commands[1]?.[0]).toBe("tar");
    expect(commands.slice(2)).toEqual(registryCommands("npx-skills", "/work/staged"));
  });

  it("stages the same surface whichever registry reads it", () => {
    for (const preStep of REGISTRY_PRE_STEPS) {
      const [archive] = preStepCommands(preStep, "/repo", "/work/staged");
      const separator = (archive as readonly string[]).indexOf("--");

      expect((archive as readonly string[]).slice(separator + 1)).toEqual([...REGISTRY_SURFACE]);
    }
  });

  it("gives the marketplace case five commands and the npx case three", () => {
    expect(preStepCommands("claude-marketplace", "/repo", "/work/staged")).toHaveLength(5);
    expect(preStepCommands("npx-skills", "/repo", "/work/staged")).toHaveLength(3);
  });
});
