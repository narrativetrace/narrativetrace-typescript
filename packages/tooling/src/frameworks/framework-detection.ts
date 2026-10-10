// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { PackageJsonLike, PackageManager } from "../doctor/types.js";
import type { Evidence, FrameworkRow, IntegrationModule, Wiring } from "./framework-row.js";
import { frameworkRowById } from "./framework-table.js";
import { withoutComments } from "./source-text.js";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** Every package name any project manifest declares, in any dependency field. */
export function declaredPackages(manifests: Iterable<PackageJsonLike>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const manifest of manifests) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(manifest[field] ?? {})) names.add(name);
    }
  }
  return names;
}

/**
 * Whether the manifests show the row's framework: one of its marker packages is declared, and no
 * row it defers to is detected as well.
 *
 * @throws {Error} when the row defers to an id the table has no row for — a typo there would
 * otherwise make the row silently never stand down
 */
export function isDetected(row: FrameworkRow, declared: ReadonlySet<string>): boolean {
  if (!row.marker.packages.some((name) => declared.has(name))) return false;
  return !row.marker.deferTo.some((id) => {
    const other = frameworkRowById(id);
    if (other === undefined) throw new Error(`row ${row.id} defers to ${id}, which is not a row`);
    return isDetected(other, declared);
  });
}

/** Whether the manifests already declare the row's integration package. */
export function isReferenced(module: IntegrationModule, declared: ReadonlySet<string>): boolean {
  return declared.has(module.packages[0] as string);
}

/** Whether any source file, comments removed, carries every pattern of one evidence item. */
export function wiringFoundIn(wiring: Wiring, sources: Iterable<string>): boolean {
  if (wiring.kind !== "snippet") return false;
  for (const source of sources) {
    const code = withoutComments(source);
    if (wiring.evidence.some((item) => provenBy(item, code))) {
      return true;
    }
  }
  return false;
}

/** Every pattern of the item in this one file — and an item with no pattern proves nothing. */
function provenBy(item: Evidence, code: string): boolean {
  return item.allOf.length > 0 && item.allOf.every((pattern) => pattern.test(code));
}

const ADD_COMMANDS: Readonly<Record<PackageManager, readonly [string, string]>> = {
  npm: ["npm install", "npm install --save-dev"],
  pnpm: ["pnpm add", "pnpm add -D"],
  yarn: ["yarn add", "yarn add --dev"],
  bun: ["bun add", "bun add --dev"],
};

/**
 * The one command that adds the row's packages with this project's package manager:
 * `@narrativetrace/*` pinned to `version` (the project's own NarrativeTrace version, so the new
 * packages match the installed ones), third-party packages bare.
 */
export function installLine(
  manager: PackageManager,
  module: IntegrationModule,
  version: string,
): string {
  const [regular, dev] = ADD_COMMANDS[manager];
  const specs = module.packages.map((name) =>
    name.startsWith("@narrativetrace/") ? `${name}@${version}` : name,
  );
  return [module.dev ? dev : regular, ...specs].join(" ");
}

/** What a printed install line pins to when the project's NarrativeTrace version is unknown. */
export const VERSION_PLACEHOLDER = "<your NarrativeTrace version>";

const VERSION_SOURCES = [
  "@narrativetrace/core-node",
  "@narrativetrace/core",
  "@narrativetrace/vitest",
];

/**
 * The NarrativeTrace version this project has installed, read from the first resolvable core
 * package, or {@link VERSION_PLACEHOLDER} when none resolves.
 */
export function narrativeTraceVersionOf(installed: ReadonlyMap<string, PackageJsonLike>): string {
  for (const name of VERSION_SOURCES) {
    const version = installed.get(name)?.version;
    if (version) return version;
  }
  return VERSION_PLACEHOLDER;
}
