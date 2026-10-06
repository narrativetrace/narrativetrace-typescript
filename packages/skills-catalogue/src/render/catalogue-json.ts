// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Skill } from "../skill.js";

/**
 * D2 (phase-3-design-2026-09-25.md): the published carrier's `catalogue.json`, versionless — an
 * installer reads its own resolved package's version instead, so a stale literal here could never
 * misreport what a project has installed (mirrors Java's `RenderMain` carrier target and
 * `SkillsCarrierJarTest.theCatalogueCarriesNoVersionLiteral`).
 */
const CARRIER_RUNTIME = "typescript";

export interface CarrierCatalogueEntry {
  readonly name: string;
  readonly description: string;
  readonly agents: string;
  readonly claude: string;
}

/** One entry per skill, in the given order — the carrier root's `agents/`/`claude/` layout. */
export function carrierCatalogueEntries(
  skills: readonly Skill[],
): readonly CarrierCatalogueEntry[] {
  return skills.map((skill) => ({
    name: skill.canonicalName,
    description: skill.description,
    agents: `agents/${skill.canonicalName}/SKILL.md`,
    claude: `claude/${skill.canonicalName}/SKILL.md`,
  }));
}

/** `{runtime, skills[]}`, pretty-printed, one trailing newline — byte-stable across renders. */
export function renderCarrierCatalogueJson(skills: readonly Skill[]): string {
  const catalogue = { runtime: CARRIER_RUNTIME, skills: carrierCatalogueEntries(skills) };
  return `${JSON.stringify(catalogue, null, 2)}\n`;
}
