// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkSilentSink } from "../../src/doctor/checks/silent-sink.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkSilentSink", () => {
  test("passes when traceObject is never used", () => {
    expect(checkSilentSink(snapshot()).status).toBe("pass");
  });

  test("passes when a consumer/sink is attached alongside traceObject", () => {
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `
            import { traceObject } from "@narrativetrace/proxy";
            import { BufferedEventConsumer } from "@narrativetrace/core-node";
            traceObject(service, context, { placeOrder: ["id"] });
          `,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("fails when traceObject is used with no consumer/sink anywhere", () => {
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { placeOrder: ["id"] });`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.fix).toContain("sink");
  });
});
