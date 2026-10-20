// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkServiceIdentity } from "../../src/doctor/checks/service-identity.js";
import { snapshot, withFiles } from "../fixture.js";

const APP = "src/checkout.ts";

describe("checkServiceIdentity", () => {
  test("passes when traceObject() is not used", () => {
    const finding = checkServiceIdentity(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("config.service-identity");
  });

  test("passes when traceObject() appears only in test files", () => {
    const finding = checkServiceIdentity(
      snapshot({ sourceFiles: withFiles({ "src/order.test.ts": "traceObject(svc, ctx);" }) }),
    );
    expect(finding.status).toBe("pass");
  });

  test("fails when application code traces and no service identity is set anywhere", () => {
    const finding = checkServiceIdentity(
      snapshot({ sourceFiles: withFiles({ [APP]: "traceObject(new Svc(), ctx);" }) }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("unknown_service:node");
    expect(finding.fix).toContain("NARRATIVETRACE_SERVICE_NAME");
    expect(finding.fix).toContain("serviceName");
  });

  test("passes when the source sets a serviceName", () => {
    const finding = checkServiceIdentity(
      snapshot({
        sourceFiles: withFiles({
          [APP]:
            'const ctx = new SyncNarrativeContext(cfg, { serviceName: "checkout-api" });\ntraceObject(new Svc(), ctx);',
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("passes when the process environment names the service", () => {
    const finding = checkServiceIdentity(
      snapshot({
        env: { NARRATIVETRACE_SERVICE_NAME: "checkout-api" },
        sourceFiles: withFiles({ [APP]: "traceObject(new Svc(), ctx);" }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("passes when an npm script names the service", () => {
    const finding = checkServiceIdentity(
      snapshot({
        rootPackageJson: {
          name: "app",
          scripts: { start: "NARRATIVETRACE_SERVICE_NAME=checkout-api node dist/main.js" },
        },
        sourceFiles: withFiles({ [APP]: "traceObject(new Svc(), ctx);" }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("does not count a commented-out serviceName", () => {
    const finding = checkServiceIdentity(
      snapshot({
        sourceFiles: withFiles({
          [APP]: '// serviceName: "checkout-api"\ntraceObject(new Svc(), ctx);',
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("does not count a near-miss identifier such as myserviceNameless", () => {
    const finding = checkServiceIdentity(
      snapshot({
        sourceFiles: withFiles({
          [APP]: "const myserviceNameless = 1;\ntraceObject(new Svc(), ctx);",
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });
});
