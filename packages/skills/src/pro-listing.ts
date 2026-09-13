// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * A Pro skill's honest listing in the FREE catalogue (agent-skills-2026-09-12.md §2 "Ruled
 * 2026-09-12"): name, the prompt a user says, what it delivers, what it needs, where it comes
 * from, status. Never the paid skill's instructions themselves — the listing is the whole entry.
 * Status must agree with `documentation/feature-guide.md`'s Pro tier table (Tier A lint).
 */
export type ProListingStatus = "shipped" | "in development" | "planned";

export interface ProListing {
  readonly canonicalName: string;
  readonly prompt: string;
  readonly delivers: string;
  readonly needs: string;
  readonly comesFrom: string;
  readonly status: ProListingStatus;
  /** The exact phrase `documentation/feature-guide.md` uses for this row — what the lint compares against. */
  readonly featureGuideStatusText: string;
}
