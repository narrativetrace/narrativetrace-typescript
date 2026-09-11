// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface WorkspacePackage {
  /** Repo-relative directory, e.g. `"packages/core"`. */
  readonly dir: string;
  /** The manifest's own `name`, e.g. `"@narrativetrace/core"`. */
  readonly name: string;
  readonly scripts: Readonly<Record<string, string>>;
}

/**
 * `relativeDir` (e.g. `"packages/core"`) is what {@link WorkspacePackage.dir} carries —
 * deliberately repo-relative, not absolute, so every caller's own `join(repoRoot, pkg.dir)` is
 * correct instead of silently doubling the root (found doing exactly that while wiring the
 * mutation and coverage sweeps against this function's first, absolute-path version).
 */
function readPackageOrEmpty(absoluteDir: string, relativeDir: string): WorkspacePackage[] {
  try {
    const raw = JSON.parse(readFileSync(join(absoluteDir, "package.json"), "utf-8")) as {
      name: string;
      scripts?: Record<string, string>;
    };
    return [{ dir: relativeDir, name: raw.name, scripts: raw.scripts ?? {} }];
  } catch {
    return [];
  }
}

/**
 * Every `packages/*` directory that carries a `package.json`, read fresh every call — never
 * hand-kept, so a package added or removed shows up here without this file changing (the same
 * "derive, don't glob or hardcode" discipline `verify-publication-packages.ts` already applies
 * to the publish set).
 */
export function discoverPackages(repoRoot: string): WorkspacePackage[] {
  const base = join(repoRoot, "packages");
  return readdirSync(base)
    .filter((entry) => statSync(join(base, entry)).isDirectory())
    .flatMap((entry) => readPackageOrEmpty(join(base, entry), join("packages", entry)));
}

/** The subset of `packages` whose manifest declares an npm script named `script`. */
export function withScript(
  packages: readonly WorkspacePackage[],
  script: string,
): WorkspacePackage[] {
  return packages.filter((p) => script in p.scripts);
}

/** A package directory's basename, e.g. `"packages/core"` → `"core"` — for log-file naming. */
export function packageSlug(dir: string): string {
  return dir.split("/").pop() ?? dir;
}
