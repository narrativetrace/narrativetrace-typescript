// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  declaredPackages,
  installLine,
  isDetected,
  isReferenced,
  narrativeTraceVersionOf,
  wiringFoundIn,
} from "../../frameworks/framework-detection.js";
import type { FrameworkRow, IntegrationModule } from "../../frameworks/framework-row.js";
import { type SnippetWiring, wiringFix } from "../../frameworks/wiring-fix.js";
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck, DoctorSnapshot, Finding } from "../types.js";

/**
 * `config.<framework>-*` — one framework-table row, observed from manifests and source: the
 * framework is present but its integration is not installed, or the integration is installed but
 * its wiring was never applied. A row with no integration shipped gets a check that REPORTS that,
 * and never fails.
 *
 * INTENT: the `add-narrative-tracing` skill lists no framework; its one framework step runs the
 * doctor and applies every `config.<framework>-*` fix in order. So every failing fix is complete on
 * its own: the install line (this project's package manager, pinned to its NarrativeTrace version),
 * then the row's wiring snippet verbatim — the compiled fixture's text from the bundled carrier.
 *
 * @llmNote Text and manifest only, never a build. A project that neither uses the framework nor
 * installed the integration passes: a check fails a project for what it got wrong, never for what
 * it does not use. Every finding carries `framework` (the row id), which is how a reader of the
 * JSON report tells the framework checks from the rest without a list of names.
 *
 * @throws {Error} for a row bound to an existing check — that check covers it, not a new one
 */
export function frameworkCheck(row: FrameworkRow): DoctorCheck {
  const { check, wiring, module } = row;
  if (check.kind === "existing-check") {
    throw new Error(`row ${row.id} is covered by ${check.id}, not a check of its own`);
  }
  if (module === null || wiring.kind !== "snippet") return noIntegrationCheck(row);
  return (snapshot) => tagged(row, wiringFinding(row, module, wiring, snapshot));
}

function tagged(row: FrameworkRow, finding: Finding): Finding {
  return { ...finding, framework: row.id };
}

function noIntegrationCheck(row: FrameworkRow): DoctorCheck {
  const id = row.check.id;
  return (snapshot) => {
    const detected = isDetected(row, declaredPackages(snapshot.manifests.values()));
    const message = detected
      ? `${row.name} detected (${row.marker.description}) — no NarrativeTrace integration is shipped for it: nothing to wire, leave it alone and trace the project's own services with traceObject`
      : `${row.name} not detected — nothing to report`;
    return tagged(row, pass(id, message, DOC.frameworkTable));
  };
}

function wiringFinding(
  row: FrameworkRow,
  module: IntegrationModule,
  wiring: SnippetWiring,
  snapshot: DoctorSnapshot,
): Finding {
  const id = row.check.id;
  const integration = module.packages[0] as string;
  const declared = declaredPackages(snapshot.manifests.values());
  const referenced = isReferenced(module, declared);
  if (!referenced && !isDetected(row, declared)) {
    return pass(id, `${row.name} not detected — nothing to wire`, DOC.frameworkTable);
  }
  if (!referenced) return notInstalled(row, module, wiring, snapshot);
  if (wiringFoundIn(wiring, snapshot.sourceFiles.values())) {
    return pass(id, `${integration} is wired: ${wiring.description}`, DOC.frameworkTable);
  }
  const message = `${integration} is installed but its wiring (${wiring.description}) is never applied — nothing in it is traced`;
  return fail(id, message, `Apply the wiring: ${wiringFix(wiring)}`, DOC.frameworkTable);
}

function notInstalled(
  row: FrameworkRow,
  module: IntegrationModule,
  wiring: SnippetWiring,
  snapshot: DoctorSnapshot,
): Finding {
  const integration = module.packages[0] as string;
  const version = narrativeTraceVersionOf(snapshot.installedPackages);
  const install = installLine(snapshot.packageManager, module, version);
  return fail(
    row.check.id,
    `${row.name} detected (${row.marker.description}) but ${integration} is not installed — nothing in it is traced`,
    `Add ${integration} — ${install}. Then ${wiringFix(wiring)}`,
    DOC.frameworkTable,
  );
}
