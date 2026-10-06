// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Carrier } from "../../src/init/carrier.js";
import { pathFor, skillCatalogue, skillEntry } from "../../src/init/skill-catalogue.js";

/**
 * A carrier built in memory, with no disk at all — the planner and renderer cases are unit tests over
 * a value, and `openCarrier`'s own tests are what prove a real directory becomes one.
 *
 * Mirrors `Carriers.fake` in the Java reference.
 */

/** One skill as a fixture names it: the directory name, and the description the block repeats. */
export interface FakeSkill {
  readonly name: string;
  readonly description?: string;
}

export const FAKE_COORDINATE = "@narrativetrace/skills@1.2.3";

/** The page body a fake carrier carries for one skill and flavour. */
export function fakePage(name: string, flavour: string): string {
  return `---\nname: ${name}\ndescription: d-${name}\n---\n\n# ${name} (${flavour})\n`;
}

/** A carrier over the given skills, in order, each with both flavours present. */
export function fakeCarrier(
  skills: readonly (FakeSkill | string)[] = ["a"],
  coordinate: string = FAKE_COORDINATE,
): Carrier {
  const named = skills.map((skill) => (typeof skill === "string" ? { name: skill } : skill));
  const entries = named.map((skill) =>
    skillEntry(
      skill.name,
      skill.description ?? `d-${skill.name}`,
      `agents/${skill.name}/SKILL.md`,
      `claude/${skill.name}/SKILL.md`,
    ),
  );
  const pages = new Map<string, string>();
  for (const entry of entries) {
    pages.set(pathFor(entry, "agents"), fakePage(entry.name, "agents"));
    pages.set(pathFor(entry, "claude"), fakePage(entry.name, "claude"));
  }
  return Object.freeze({
    coordinate,
    catalogue: skillCatalogue("typescript", entries),
    root: "/fake/carrier",
    source: "bundled" as const,
    pages,
  });
}
