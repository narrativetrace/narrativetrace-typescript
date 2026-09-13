// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { satisfiesRange } from "../../semver-lite.js";
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck, Finding, PackageJsonLike } from "../types.js";

const ID = "toolchain.vitest-peer";

function noVitestInstalled(range: string): Finding {
  const message = `@narrativetrace/vitest requires a peer vitest@${range}, but no vitest install was found`;
  const fix = `Install a vitest version satisfying ${range} (npm add -D vitest, then npm ci for a clean lockfile install).`;
  return fail(ID, message, fix, DOC.vitestConfiguration);
}

function mismatchedVitest(range: string, installed: string): Finding {
  const message = `vitest@${installed} does not satisfy @narrativetrace/vitest's declared peer range ${range}`;
  const fix = `Install a vitest version satisfying ${range}, then reinstall clean (rm -rf node_modules && npm ci) — a mismatched peer here is the one failure mode that breaks the library's own build.`;
  return fail(ID, message, fix, DOC.vitestConfiguration);
}

function evaluateInstalledVitest(range: string, vitest: PackageJsonLike | undefined): Finding {
  if (!vitest?.version) return noVitestInstalled(range);
  if (satisfiesRange(vitest.version, range)) {
    const message = `vitest@${vitest.version} satisfies the declared peer range ${range}`;
    return pass(ID, message, DOC.vitestConfiguration);
  }
  return mismatchedVitest(range, vitest.version);
}

/** The installed `vitest` version must satisfy `@narrativetrace/vitest`'s declared peer range. */
export const checkVitestPeer: DoctorCheck = (snapshot) => {
  const ntVitest = snapshot.installedPackages.get("@narrativetrace/vitest");
  const range = ntVitest?.peerDependencies?.vitest;
  if (!ntVitest || !range) {
    return pass(
      ID,
      "@narrativetrace/vitest is not installed — nothing to check",
      DOC.vitestConfiguration,
    );
  }
  return evaluateInstalledVitest(range, snapshot.installedPackages.get("vitest"));
};
