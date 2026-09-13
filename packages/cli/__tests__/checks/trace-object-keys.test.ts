// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkTraceObjectKeys } from "../../src/doctor/checks/trace-object-keys.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkTraceObjectKeys", () => {
  test("passes when traceObject is called with the flat param-names-map shape", () => {
    const finding = checkTraceObjectKeys(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { placeOrder: ["id"] });`,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("passes on the legitimate nested methods shape (an object, not an array, per method)", () => {
    const finding = checkTraceObjectKeys(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { methods: { placeOrder: { params: ["id"] } } });`,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("fails when a method entry skips the per-method config object", () => {
    const finding = checkTraceObjectKeys(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { methods: { placeOrder: ["id"] } });`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("src/wire.ts");
    expect(finding.id).toBe("config.trace-object-keys");
    expect(finding.fix).toContain("Nest the parameter names under params");
  });

  test("still matches with a space before the colon after 'methods'", () => {
    const finding = checkTraceObjectKeys(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { methods : { placeOrder: ["id"] } });`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("still matches with no space after 'methods:'", () => {
    const finding = checkTraceObjectKeys(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { methods:{ placeOrder: ["id"] } });`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });

  test("still matches with no space before the offending array", () => {
    const finding = checkTraceObjectKeys(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { methods: { placeOrder:["id"] } });`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
  });
});
