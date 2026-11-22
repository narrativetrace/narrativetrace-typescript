// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { MarketplaceListing } from "./marketplace-listing.js";

/**
 * The Anthropic plugin directory's own listing fields, beside the vendor-neutral
 * {@link MarketplaceListing} every registry shares. The directory titles a plugin from
 * `displayName` (without it, the title is the kebab-case name) and links its support, privacy and
 * documentation entries from the three URLs; everything else the manifest needs comes from `base`.
 */
export interface ClaudeListing {
  /** The vendor-neutral listing this directory entry is drawn from. */
  readonly base: MarketplaceListing;
  /** The title shown in the directory. */
  readonly displayName: string;
  /** Where a user reports a problem. */
  readonly supportUrl: string;
  /** The privacy policy. */
  readonly privacyPolicyUrl: string;
  /** Where the documentation lives. */
  readonly documentationUrl: string;
}
