// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { satisfiesRange } from "../../semver-lite.js";
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "toolchain.node-engine";
const DEFAULT_ENGINE_RANGE = ">=20";

/** Node version required by whichever core NarrativeTrace package is installed, else the repo default. */
function requiredRange(snapshot: Parameters<DoctorCheck>[0]): string {
  const core = snapshot.installedPackages.get("@narrativetrace/core");
  const coreNode = snapshot.installedPackages.get("@narrativetrace/core-node");
  return core?.engines?.node ?? coreNode?.engines?.node ?? DEFAULT_ENGINE_RANGE;
}

/** Node engines (Installation Guide §Prerequisites): the running Node must satisfy the installed package's `engines.node`. */
export const checkNodeEngine: DoctorCheck = (snapshot) => {
  const required = requiredRange(snapshot);
  if (satisfiesRange(snapshot.nodeVersion, required)) {
    return pass(
      ID,
      `Node ${snapshot.nodeVersion} satisfies the required ${required}`,
      DOC.installationPrerequisites,
    );
  }
  return fail(
    ID,
    `Node ${snapshot.nodeVersion} does not satisfy the required ${required}`,
    `Upgrade Node to a version satisfying ${required} (nvm, volta, asdf, or your CI image).`,
    DOC.installationPrerequisites,
  );
};
