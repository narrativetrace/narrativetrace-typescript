// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { ADD_NARRATIVE_TRACING } from "./catalogue/add-narrative-tracing.js";
import { NARRATIVETRACE_DOCTOR } from "./catalogue/narrativetrace-doctor.js";
import { PRO_LISTINGS } from "./catalogue/pro-listings.js";
import type { ProListing } from "./pro-listing.js";
import type { Skill } from "./skill.js";

/** Every skill in the free TypeScript catalogue, appended to as skills ship. */
export const SKILLS: readonly Skill[] = [NARRATIVETRACE_DOCTOR, ADD_NARRATIVE_TRACING];

export function findSkill(canonicalName: string): Skill | undefined {
  return SKILLS.find((skill) => skill.canonicalName === canonicalName);
}

export function findProListing(canonicalName: string): ProListing | undefined {
  return PRO_LISTINGS.find((listing) => listing.canonicalName === canonicalName);
}

export { PRO_LISTINGS };
