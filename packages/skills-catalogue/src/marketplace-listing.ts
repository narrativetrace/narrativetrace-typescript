// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * This runtime's registry identity: everything a plugin-marketplace listing needs that is not a
 * skill page. One listing per runtime repository — the marketplace and its single plugin share
 * the name, because a marketplace name is unique per user and every runtime in the family ships
 * skills under the same canonical names.
 *
 * No version, deliberately: with a relative-path plugin source the installed version IS the
 * repository's commit, so a version literal here would drift on every release and say nothing
 * the commit does not (ruling 7, phase-4-design-2026-09-27.md D2).
 */
export interface MarketplaceListing {
  /**
   * The marketplace identifier AND the plugin's — what a user types after `@` when installing,
   * and (with no `plugin.json` in the tree) the plugin's manifest name too.
   */
  readonly name: string;
  readonly owner: MarketplaceOwner;
  /** The marketplace's own line, shown when browsing it. */
  readonly description: string;
  /** The plugin entry's line, shown in the plugin list and details. */
  readonly pluginDescription: string;
  /**
   * The plugin's directory, relative to the marketplace root (the repository root, the directory
   * holding `.claude-plugin/`) — the rendered pages' own root, so the plugin carries the skills
   * and nothing else of the repository.
   */
  readonly pluginSource: string;
  /** SPDX identifier of the pages the plugin ships, which may differ from the repository root's own licence. */
  readonly license: string;
  readonly homepage: string;
  readonly keywords: readonly string[];
}

/** Who maintains the listing, and where to read about them. */
export interface MarketplaceOwner {
  readonly name: string;
  readonly url: string;
}
