// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { settleMarkers } from "./settle-since-markers.js";
import {
  classifyStatus,
  DEFAULT_REGISTRY_BASE,
  type FetchStatus,
  versionUrl,
} from "./verify-publication-registry.js";

// CLI entry `scripts/settle-markers.sh` shells out to. Two refusals, both exit 1 with nothing
// written: the version isn't (yet) on the registry — a settle must never run ahead of the actual
// publish, and an offline run refuses rather than guessing — or the settle found zero markers to
// rewrite, which is a mistake (a stale version argument, a scope that missed something) rather
// than a success (retro rule 2: nothing-to-do is never silently a pass).

const DEFAULT_REGISTRY_PACKAGE = "@narrativetrace/core";

export interface RunSettleOptions {
  readonly registryBase?: string;
  readonly registryPackage?: string;
  readonly fetchStatus?: FetchStatus;
}

export interface RunSettleResult {
  readonly exitCode: 0 | 1;
  readonly changed: readonly string[];
  readonly mirrorsRestamped: readonly string[];
  readonly message: string;
}

async function defaultFetchStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * Refuses (exit 1, nothing written) unless `version` is present on the registry under
 * `registryPackage` — checked the same way `tools/verify-publication-registry.ts` checks any
 * other package/version pair (a plain `GET <base>/<name>/<version>`, 200 = present). Only then
 * calls {@link settleMarkers}, and refuses again (exit 1) if it settled nothing.
 */
export async function runSettle(
  repoRoot: string,
  version: string,
  options: RunSettleOptions = {},
): Promise<RunSettleResult> {
  const registryBase = options.registryBase ?? DEFAULT_REGISTRY_BASE;
  const registryPackage = options.registryPackage ?? DEFAULT_REGISTRY_PACKAGE;
  const fetchStatus = options.fetchStatus ?? defaultFetchStatus;

  const status = await fetchStatus(versionUrl(registryBase, registryPackage, version));
  if (classifyStatus(status) !== "PRESENT") {
    return {
      exitCode: 1,
      changed: [],
      mirrorsRestamped: [],
      message:
        `REFUSED: ${registryPackage}@${version} is not on the registry (${registryBase}) — ` +
        'a settle must never run ahead of the publish. (Offline counts as "not on the ' +
        'registry" here — this never guesses.)',
    };
  }

  const { changed, mirrorsRestamped } = settleMarkers(repoRoot, version);
  if (changed.length === 0) {
    return {
      exitCode: 1,
      changed,
      mirrorsRestamped,
      message: `REFUSED: no 'since ${version}, unreleased' marker found anywhere in scope — nothing to settle is a mistake, not a success.`,
    };
  }

  const lines = [
    `${changed.length} file(s) settled for ${version}:`,
    ...changed.map((file) => `  ${file}`),
  ];
  lines.push(
    mirrorsRestamped.length > 0
      ? `${mirrorsRestamped.length} translated mirror(s) restamped:`
      : "0 translated mirror(s) restamped.",
  );
  lines.push(...mirrorsRestamped.map((file) => `  ${file}`));
  return { exitCode: 0, changed, mirrorsRestamped, message: lines.join("\n") };
}

async function main(): Promise<void> {
  const [, , repoRoot, version] = process.argv;
  if (!repoRoot || !version) {
    console.error("usage: tsx settle-since-markers-cli.ts <repoRoot> <version>");
    process.exit(1);
  }
  const result = await runSettle(repoRoot, version);
  console.log(result.message);
  process.exitCode = result.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
