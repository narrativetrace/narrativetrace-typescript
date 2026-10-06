// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { type Carrier, resolveCarrier } from "@narrativetrace/tooling";

/**
 * Where this launcher looks for the skills carrier it installs from.
 *
 * INTENT: one place knows that the running CLI bundles a copy of the carrier, and where. Everything
 * else about resolution — the order of the homes, what makes a carrier valid — belongs to
 * `@narrativetrace/tooling`'s `resolveCarrier`, so both entry points can never disagree about it.
 *
 * @llmNote Zero network, by construction: the three homes are a path a person named, the project's own
 * `node_modules`, and this package's own directory. D4 rules the npm cache unreadable, so `--from`
 * takes a path and a coordinate is never looked up.
 *
 * @sideEffects Reads the carrier's files once, through `resolveCarrier`.
 */

/**
 * This CLI package's own root — the directory whose `skills/` holds the carrier it bundles.
 *
 * @llmNote Derived from this module's own location, which is one directory below the package root in
 * BOTH layouts this code runs in: `src/` under vitest, and `dist/` in the published package. A
 * `process.argv[1]`-based answer would be wrong under the bin shim, and a `process.cwd()`-based one
 * would be the consumer's project.
 */
export function cliPackageDirectory(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Opens the carrier for one run: `--from` when a path was given, else the `@narrativetrace/skills` the
 * PROJECT resolves, else the copy this CLI bundles.
 *
 * @param projectDirectory the consumer project the install is for
 * @param from the directory a person named with `--from`, or `undefined`
 * @throws {TypeError} when the named path holds no carrier, or when no home does.
 */
export function openCarrierFor(projectDirectory: string, from: string | undefined): Carrier {
  return resolveCarrier({ projectDirectory, bundledDirectory: cliPackageDirectory(), from });
}
