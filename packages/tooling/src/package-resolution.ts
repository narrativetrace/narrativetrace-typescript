// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PackageJsonLike } from "./doctor/types.js";

/**
 * How this library finds a package a consumer project has installed — without going through that
 * package's `exports` map.
 *
 * INTENT: two callers need the same answer. The doctor reads an installed package's manifest to
 * compare versions; the installer reads the skills carrier's directory to copy pages out of it.
 * Both mean "resolvable from the CONSUMER's own root", and both have to work on a published package
 * that does not export its own `package.json`.
 *
 * @llmNote Every published `@narrativetrace/*` package declares `exports` and none of them list
 * `"./package.json"`, so `require.resolve("<name>/package.json")` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` for all of them in a real consumer project. That silently turned
 * every version-comparing doctor check into its own "not installed — nothing to check" pass against
 * every real install. Walking the `node_modules` chain upward reads the manifest as a FILE, which no
 * exports map can hide.
 *
 * @sideEffects Reads. Never writes, never resolves anything over a network.
 */

/** Every `node_modules` directory a consumer rooted at `cwd` resolves through, nearest first. */
export function* nodeModulesChain(cwd: string): Generator<string> {
  let dir = resolve(cwd);
  for (;;) {
    yield join(dir, "node_modules");
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

// Stryker disable BlockStatement: the catch block below is just `return undefined;`, which is
// equivalent under mutation — an emptied `catch {}` falls off the end of the function and implicitly
// returns `undefined` too. No test can observe a difference between the explicit and implicit forms.

/** A parsed JSON file, or `undefined` when it is absent or unreadable. */
export function readJsonFile(path: string): PackageJsonLike | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJsonLike;
  } catch {
    return undefined;
  }
}

// Stryker restore BlockStatement

/**
 * The directory an installed package sits in, or `undefined` when nothing resolves it — the nearest
 * one whose `package.json` can actually be read.
 */
export function resolvePackageDirectory(name: string, cwd: string): string | undefined {
  const segments = name.split("/");
  for (const modules of nodeModulesChain(cwd)) {
    const directory = join(modules, ...segments);
    if (readJsonFile(join(directory, "package.json"))) return directory;
  }
  return undefined;
}

/** An installed package's own `package.json`, read as a file rather than through its exports map. */
export function resolvePackageJson(name: string, cwd: string): PackageJsonLike | undefined {
  const directory = resolvePackageDirectory(name, cwd);
  return directory === undefined ? undefined : readJsonFile(join(directory, "package.json"));
}
