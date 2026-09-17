// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolves the shared hostile-corpus master copy these fixtures must stay byte-identical to (the
 * golden Java repo's `narrativetrace-security-tests/src/test/resources/hostile-corpus/`, §6.7).
 * Never assumed present — a checkout without that repo as a sibling, or a dev container without
 * the mount, must stay green with a loud skip rather than fail or silently pass nothing.
 *
 * Candidates, in order: `JAVA_REPO` (an explicit override, same env var the dev-container tooling
 * already uses for the read-only mount), `/workspace-java` (that mount's path inside the dev
 * container), then the golden repo checked out as a host sibling (this file's location plus four
 * `..`: `__tests__` -> `security-tests` -> `packages` -> repo root -> its parent).
 */
const JAVA_REPO_ENV = "JAVA_REPO";
const WORKSPACE_MOUNT = "/workspace-java";
// The golden repo's directory name, checked out as a host sibling — see the module doc above.
// A reviewed .publishallow exception covers this line for the publish tooling's own trace gate
// (dev-tooling config, not a development trace — same class as legal.properties'
// legal.goldenRepo entry there).
const GOLDEN_REPO_DIR_NAME = "narrative-trace-java";

function javaRepoCandidates(): string[] {
  const envOverride = process.env[JAVA_REPO_ENV];
  const hostSibling = join(import.meta.dirname, "..", "..", "..", "..", GOLDEN_REPO_DIR_NAME);
  return [envOverride, WORKSPACE_MOUNT, hostSibling].filter((c): c is string => Boolean(c));
}

const MASTER_RELATIVE_PATH =
  "narrativetrace-security-tests/src/test/resources/hostile-corpus/graphs.json";

/** The master `graphs.json` path, or `undefined` when no candidate java repo is found on disk. */
export function resolveMasterGraphsPath(): string | undefined {
  for (const repo of javaRepoCandidates()) {
    const candidate = join(repo, MASTER_RELATIVE_PATH);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}
