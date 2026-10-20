// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { MarketplaceListing } from "./marketplace-listing.js";

/** The directory's own ceiling on `displayName` and `shortDescription`, in characters. */
export const MAX_LISTING_FIELD_LENGTH = 30;

const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;

/**
 * The OpenAI plugin directory's own listing fields (the directory is shared by ChatGPT and Codex),
 * beside the vendor-neutral {@link MarketplaceListing} every registry shares. Everything else the
 * directory's manifest needs — `name`, `description`, `author.name`, `homepage`, `license`,
 * `keywords` — comes from `base`, so this type never repeats a fact the vendor-neutral listing
 * already states.
 *
 * No privacy-policy or terms-of-service URL field: both are optional for a skills-only submission,
 * narrativetrace.ai carries neither page yet, and a field the renderer would never read is dead
 * weight. Add both back together with the rendering they would drive once the two pages exist.
 */
export interface OpenAiListingFields {
  /** The vendor-neutral listing this directory entry is drawn from. */
  readonly base: MarketplaceListing;
  /** Shown in the directory; non-empty, at most {@link MAX_LISTING_FIELD_LENGTH} characters. */
  readonly displayName: string;
  /** The one-line pitch; non-empty, at most {@link MAX_LISTING_FIELD_LENGTH} characters. */
  readonly shortDescription: string;
  /** The directory's own grouping for the listing (allowed values unverified). */
  readonly category: string;
  /** What the plugin declares it can do (allowed values unverified). */
  readonly capabilities: readonly string[];
  /** Example prompts shown to a user before they have typed anything. */
  readonly defaultPrompts: readonly string[];
  /** The listing's accent colour, `#RRGGBB`. */
  readonly brandColor: string;
  /** Where a reader goes to learn more. */
  readonly websiteUrl: string;
}

function requireListingField(field: string, value: string): void {
  if (value.trim() === "" || value.length > MAX_LISTING_FIELD_LENGTH) {
    throw new RangeError(
      `${field} must be non-blank and at most ${MAX_LISTING_FIELD_LENGTH} UTF-16 units, was ${value.length}`,
    );
  }
}

/**
 * Builds an {@link OpenAiListingFields} the directory will accept: a `displayName` or
 * `shortDescription` outside 1 to 30 characters, or a `brandColor` that is not `#RRGGBB`, throws
 * `RangeError` here instead of surfacing as a rejected upload. The lists are copied, so the result
 * does not alias the caller's arrays.
 */
export function openAiListing(fields: OpenAiListingFields): OpenAiListingFields {
  requireListingField("displayName", fields.displayName);
  requireListingField("shortDescription", fields.shortDescription);
  if (!HEX_COLOUR.test(fields.brandColor)) {
    throw new RangeError(`brandColor must be #RRGGBB, was ${JSON.stringify(fields.brandColor)}`);
  }
  return {
    ...fields,
    capabilities: [...fields.capabilities],
    defaultPrompts: [...fields.defaultPrompts],
  };
}
