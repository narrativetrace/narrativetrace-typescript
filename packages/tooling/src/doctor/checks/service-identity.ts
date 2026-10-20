// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck, DoctorSnapshot } from "../types.js";
import { applicationSource } from "./application-source.js";

const ID = "config.service-identity";
const ENV_KEY = "NARRATIVETRACE_SERVICE_NAME";
const TRACE_OBJECT_CALL = /\btraceObject\s*\(/;
const SERVICE_NAME_IN_CODE = /\bserviceName\b/;
const FIX =
  "Name the service: set NARRATIVETRACE_SERVICE_NAME (and NARRATIVETRACE_SERVICE_VERSION, NARRATIVETRACE_ENVIRONMENT) where the app starts, " +
  "or pass { serviceName: 'checkout-api' } to the context constructor — the TypeScript runtime reads no service name from anywhere else.";

function environmentNamesService(snapshot: DoctorSnapshot): boolean {
  if (snapshot.env[ENV_KEY]) return true;
  const manifests = [snapshot.rootPackageJson, ...snapshot.manifests.values()];
  return manifests.some((manifest) =>
    Object.values(manifest?.scripts ?? {}).some((script) => script.includes(ENV_KEY)),
  );
}

/**
 * Application code traces and nothing names the service: every chapter the platform or the OTel
 * bridge receives then reads `unknown_service:node`. A name is evidence in application code
 * (`serviceName`), the process environment, or an npm script; tests are not judged, because a
 * test's trace never leaves the machine.
 */
export const checkServiceIdentity: DoctorCheck = (snapshot) => {
  const app = applicationSource(snapshot);
  if (!app.some(({ code }) => TRACE_OBJECT_CALL.test(code))) {
    return pass(
      ID,
      "no application code calls traceObject() — nothing to name",
      DOC.serviceIdentity,
    );
  }
  if (
    app.some(({ code }) => SERVICE_NAME_IN_CODE.test(code)) ||
    environmentNamesService(snapshot)
  ) {
    return pass(ID, "the service identity is set", DOC.serviceIdentity);
  }
  const message =
    "application code calls traceObject() but no service name is set — exported traces read unknown_service:node";
  return fail(ID, message, FIX, DOC.serviceIdentity);
};
