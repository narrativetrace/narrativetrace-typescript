// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ADD_NARRATIVE_TRACING } from "./catalogue/add-narrative-tracing.js";
import { ADD_NARRATIVETRACE_CLARITY } from "./catalogue/add-narrativetrace-clarity.js";
import { NARRATIVETRACE_DEBUG } from "./catalogue/narrativetrace-debug.js";
import { NARRATIVETRACE_DOCTOR } from "./catalogue/narrativetrace-doctor.js";
import { NARRATIVETRACE_FEEDBACK } from "./catalogue/narrativetrace-feedback.js";
import { NARRATIVETRACE_VERIFY } from "./catalogue/narrativetrace-verify.js";
import { PRO_LISTINGS } from "./catalogue/pro-listings.js";
import type { MarketplaceListing } from "./marketplace-listing.js";
import type { ProListing } from "./pro-listing.js";
import type { Skill } from "./skill.js";

/** Every skill in the free TypeScript catalogue, appended to as skills ship. */
export const SKILLS: readonly Skill[] = [
  NARRATIVETRACE_DOCTOR,
  ADD_NARRATIVE_TRACING,
  NARRATIVETRACE_FEEDBACK,
  ADD_NARRATIVETRACE_CLARITY,
  NARRATIVETRACE_VERIFY,
  NARRATIVETRACE_DEBUG,
];

/**
 * How this repository presents {@link SKILLS} to a plugin marketplace. One listing, whose name is
 * the repository's own runtime slug: marketplace name and plugin name are the same string because
 * a marketplace name is unique per user, and every runtime in the family ships skills under the
 * same canonical names.
 *
 * The plugin's source is the rendered pages' own directory, so the plugin carries the two skill
 * pages and nothing else of this repository.
 */
export const MARKETPLACE: MarketplaceListing = {
  name: "narrativetrace-typescript",
  owner: { name: "NarrativeTrace", url: "https://narrativetrace.ai" },
  description: "The NarrativeTrace agent skills for TypeScript.",
  pluginDescription:
    "Install NarrativeTrace in a TypeScript project and reach a first trace, diagnose an install that traces nothing, add or verify a Clarity naming report, report a defect in NarrativeTrace itself with your approval, verify a change by reading its trace and pinning it as a baseline, and debug a wrong result by naming the span where it diverged.",
  pluginSource: "./.claude",
  license: "Apache-2.0",
  homepage: "https://narrativetrace.ai",
  keywords: ["narrativetrace", "typescript", "tracing", "observability", "agent-skills"],
};

export function findSkill(canonicalName: string): Skill | undefined {
  return SKILLS.find((skill) => skill.canonicalName === canonicalName);
}

export function findProListing(canonicalName: string): ProListing | undefined {
  return PRO_LISTINGS.find((listing) => listing.canonicalName === canonicalName);
}

export { PRO_LISTINGS };
