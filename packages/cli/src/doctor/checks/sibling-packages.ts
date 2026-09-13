// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "toolchain.sibling-packages";

/**
 * `@narrativetrace/vitest` depends on five sibling `@narrativetrace/*` packages (clarity,
 * core-node, diagrams, glossary, proxy — not peers, regular dependencies). Under pnpm's default
 * strict layout those resolve fine from inside `@narrativetrace/vitest`'s own `node_modules`, but a
 * consumer that also imports one of them directly needs it resolvable from ITS OWN root too, or
 * pnpm's non-hoisting layout hands the app a second, unrelated copy. This check reads the sibling
 * list from the installed package itself (never a hardcoded list — it tracks the dependency as it
 * grows) and confirms each one resolves from the consumer.
 */
export const checkSiblingPackages: DoctorCheck = (snapshot) => {
  const ntVitest = snapshot.installedPackages.get("@narrativetrace/vitest");
  if (!ntVitest) {
    const message = "@narrativetrace/vitest is not installed — nothing to check";
    return pass(ID, message, DOC.installationDependencies);
  }
  const siblings = Object.keys(ntVitest.dependencies ?? {}).filter((n) =>
    n.startsWith("@narrativetrace/"),
  );
  const unresolved = siblings.filter((name) => !snapshot.installedPackages.has(name));
  if (unresolved.length === 0) {
    const message = `all ${siblings.length} sibling package(s) of @narrativetrace/vitest resolve from the consumer`;
    return pass(ID, message, DOC.installationDependencies);
  }
  const message = `${unresolved.length} sibling package(s) of @narrativetrace/vitest do not resolve from the consumer: ${unresolved.join(", ")}`;
  const fix = `Add ${unresolved.join(", ")} as explicit direct dependencies — pnpm's strict layout does not hoist a dependency's own transitive dependencies to your project root.`;
  return fail(ID, message, fix, DOC.installationDependencies);
};
