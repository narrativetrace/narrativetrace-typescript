// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { PackageJsonLike, PackageManager } from "./types.js";

/** Every root lockfile that names a package manager, with the manager it names. */
const LOCKFILE_MANAGERS: readonly (readonly [string, PackageManager])[] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

/** The lockfile names the snapshot looks for at the project root. */
export const LOCKFILES: readonly string[] = LOCKFILE_MANAGERS.map(([name]) => name);

const MANAGERS: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

/**
 * The package manager a printed install line should use: the root manifest's own `packageManager`
 * field (corepack's `"pnpm@9.12.0"`) when it names one this doctor knows, else the first root
 * lockfile present, else npm — the manager every Node install has. A field that is not a string
 * is a malformed manifest the doctor reads past, never a crash.
 *
 * INTENT: a framework fix that says `npm install` in a pnpm workspace writes a second lockfile and
 * an unhoisted `node_modules`; the fix the doctor prints has to be the one the project would run.
 */
export function packageManagerOf(
  root: PackageJsonLike | undefined,
  lockfiles: readonly string[],
): PackageManager {
  const field: unknown = root?.packageManager;
  const declared = typeof field === "string" ? field.split("@")[0] : undefined;
  const known = MANAGERS.find((manager) => manager === declared);
  if (known) return known;
  const fromLockfile = LOCKFILE_MANAGERS.find(([name]) => lockfiles.includes(name));
  return fromLockfile ? fromLockfile[1] : "npm";
}
