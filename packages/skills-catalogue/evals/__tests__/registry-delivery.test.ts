// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { deliveryCommands, type RegistryDelivery, stagedSnapshotIn } from "../registry-delivery.js";
import { registryCommands } from "../registry-pre-step.js";

/**
 * One case's delivery: the registry that put its pages in place, and the work directory the trial
 * owns. The rule worth its own assertions is where the staged tree lives: beside the graded
 * project, never inside it.
 */

const DELIVERY: RegistryDelivery = { preStep: "npx-skills", workDir: "/work/trial-1" };

describe("stagedSnapshotIn", () => {
  it("puts the registry's tree inside the WORK directory, so the project never holds a copy", () => {
    expect(stagedSnapshotIn("/work/trial-1")).toBe("/work/trial-1/staged");
    expect(stagedSnapshotIn("/work/trial-1").startsWith("/scratch")).toBe(false);
  });
});

describe("deliveryCommands", () => {
  it("is the staging of HEAD's surface followed by the registry's own documented lines", () => {
    const commands = deliveryCommands(DELIVERY, "/repo");

    expect(commands[0]?.[0]).toBe("git");
    expect(commands[1]?.[0]).toBe("tar");
    expect(commands.slice(2)).toEqual(registryCommands("npx-skills", "/work/trial-1/staged"));
  });

  it("points every command at the staged tree, never at the repository being read", () => {
    for (const command of deliveryCommands(DELIVERY, "/repo").slice(2)) {
      expect(command).toContain("/work/trial-1/staged");
    }
  });
});
