// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { InstalledSkill } from "../../init/installed-skill.js";
import { versionOf } from "../../init/version-guard.js";
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck, DoctorSnapshot } from "../types.js";

const ID = "config.skills-installed";
const FAMILY_PACKAGE = "@narrativetrace/core";
const INIT_DRY_RUN = "npx --yes @narrativetrace/cli init --dry-run";
const NOT_OURS = " (there, but not ours)";

/** What a check needs of one catalogue skill: what is installed at its `.agents/skills/` path. */
function agentsSkill(snapshot: DoctorSnapshot, name: string): InstalledSkill | undefined {
  return snapshot.installedSkills.find(
    (skill) => skill.flavour === "agents" && skill.name === name,
  );
}

/** The catalogue's skills that are installed and carry our provenance line. */
function oursOf(snapshot: DoctorSnapshot): InstalledSkill[] {
  return snapshot.catalogueSkills
    .map((name) => agentsSkill(snapshot, name))
    .filter((skill): skill is InstalledSkill => skill?.presence === "ours");
}

/** The catalogue's skills that are absent, or present as somebody else's — named for a reader. */
function missingOf(snapshot: DoctorSnapshot): string[] {
  return snapshot.catalogueSkills
    .filter((name) => agentsSkill(snapshot, name)?.presence !== "ours")
    .map((name) => (agentsSkill(snapshot, name) === undefined ? name : `${name}${NOT_OURS}`));
}

/** The catalogue's skills that have a directory in this project, present or foreign alike. */
function presentOf(snapshot: DoctorSnapshot): string[] {
  return snapshot.catalogueSkills.filter((name) => agentsSkill(snapshot, name) !== undefined);
}

/** Every distinct stamp among `ours` that is not this project's resolved release, sorted. */
function staleStampsOf(ours: readonly InstalledSkill[], projectVersion: string): string[] {
  const stale = ours
    .map((skill) => skill.coordinate)
    .filter((coordinate) => versionOf(coordinate) !== projectVersion);
  return [...new Set(stale)].sort();
}

function cannotTell() {
  return pass(
    ID,
    "cannot tell whether the agent skills are installed and current — this project resolves no NarrativeTrace release",
    DOC.agentSkillsInstalling,
  );
}

function notInstalled(snapshot: DoctorSnapshot) {
  const present = presentOf(snapshot);
  const suffix = present.length === 0 ? "" : ` — ${present.join(", ")} is there, not ours`;
  return fail(
    ID,
    `The NarrativeTrace agent skills are not installed under .agents/skills/${suffix}`,
    `Run \`${INIT_DRY_RUN}\`, read the diff, then run it without the flag.`,
    DOC.agentSkillsInstalling,
  );
}

function stale(staleStamps: readonly string[], projectVersion: string) {
  return fail(
    ID,
    `Agent skills installed from ${staleStamps.join(", ")}, project resolves ${projectVersion}`,
    `Re-run \`${INIT_DRY_RUN}\` and apply it — the installed pages describe a different release of` +
      " NarrativeTrace than this project uses.",
    DOC.agentSkillsInstalling,
  );
}

function incomplete(missing: readonly string[]) {
  return fail(
    ID,
    `The agent skills are installed, but this carrier's ${missing.join(", ")} is missing`,
    `Run \`${INIT_DRY_RUN}\` to add the missing page(s); --force lets it replace a directory` +
      " somebody else owns.",
    DOC.agentSkillsInstalling,
  );
}

function upToDate(ours: readonly InstalledSkill[], projectVersion: string) {
  return pass(
    ID,
    `All ${ours.length} agent skill(s) are installed and current for` +
      ` @narrativetrace/core@${projectVersion}`,
    DOC.agentSkillsInstalling,
  );
}

/**
 * `config.skills-installed` — the NarrativeTrace agent skills this project's carrier ships are
 * installed under `.agents/skills/`, and stamped with a release this project actually resolves.
 *
 * @llmNote Read-only, like every check: it reads what the installer's own reader found — a page
 * is "ours" only when it carries the provenance line `init` writes — so the doctor and `init` can
 * never disagree about which directory belongs to whom.
 *
 * @llmNote The one outcome that is NOT a failure is a project that resolves no NarrativeTrace
 * release at all (an empty directory): the doctor never guesses, so it says it cannot tell and
 * passes. A project that simply never ran `init` is a FAILURE, not an exemption — the doctor's
 * audience is a project that already has the library.
 *
 * @llmNote "Current" means the same VERSION as the project resolves, never the same coordinate —
 * `npx` can resolve a different CLI release than the project's own `@narrativetrace/core`, so
 * comparing whole coordinates would blame the pages for something the CLI's own resolution chose.
 *
 * @llmNote Only `.agents/skills/` counts. The vendor copy is written only where a project is
 * detected as that vendor's, so a project carrying the vendor copy alone is a project the
 * open-standard install never reached.
 */
export const checkSkillsInstalled: DoctorCheck = (snapshot) => {
  const projectVersion = snapshot.installedPackages.get(FAMILY_PACKAGE)?.version;
  if (snapshot.catalogueSkills.length === 0 || projectVersion === undefined) return cannotTell();
  const ours = oursOf(snapshot);
  if (ours.length === 0) return notInstalled(snapshot);
  const staleStamps = staleStampsOf(ours, projectVersion);
  if (staleStamps.length > 0) return stale(staleStamps, projectVersion);
  const missing = missingOf(snapshot);
  return missing.length === 0 ? upToDate(ours, projectVersion) : incomplete(missing);
};
