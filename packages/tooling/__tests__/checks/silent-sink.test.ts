// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkSilentSink } from "../../src/doctor/checks/silent-sink.js";
import { snapshot, withFiles } from "../fixture.js";

describe("checkSilentSink", () => {
  test("passes when traceObject is never used", () => {
    const finding = checkSilentSink(snapshot());
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("trap.silent-sink");
    expect(finding.message).toBe("traceObject() is not used — nothing to check");
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
    expect(finding.message).toBe("traceObject() is used and a consumer/sink is attached");
  });

  test("passes when the sink signal lives in a different file than the traceObject call", () => {
    // The two checks scan across every file's content independently — a call in one file and a
    // sink import in another must both be enough; requiring both signals in the SAME file (as
    // an .every() over files would) is the bug this pins down.
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { placeOrder: ["id"] });`,
          "src/pipeline.ts": `import { BufferedEventConsumer } from "@narrativetrace/core-node";`,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("recognizes traceObject( with a space before the parenthesis", () => {
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject (service, context, { placeOrder: ["id"] });`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
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
    expect(finding.fix).toContain("Attach a sink: pass a BufferedEventConsumer");
    expect(finding.message).toBe(
      "traceObject() is used but no consumer or sink (BufferedEventConsumer, captureTrace(), a log/OTel bridge, or @narrativetrace/vitest) was found",
    );
  });
});
