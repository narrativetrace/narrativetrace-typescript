// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { checkSilentSink } from "../../src/doctor/checks/silent-sink.js";
import { DOCTOR_REPORT_FIELD, valueFreeViolations } from "../../src/feedback/value-free-check.js";
import { wiringSnippet } from "../../src/frameworks/wiring-snippets.js";
import { pkg, snapshot, withFiles, withPackages } from "../fixture.js";

const PINO_FIXTURE = "packages/pino/__tests__/wiring/narrative-pipeline.ts";
const UNSUNK = { "src/wire.ts": `traceObject(service, context, { placeOrder: ["id"] });` };

function declaring(dependencies: Record<string, string>) {
  return withPackages({ "package.json": pkg({ dependencies }) });
}

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

  test.each([
    [
      "NestJS: AutoProxyModule hands each request's tree to onRequestComplete",
      `import { AutoProxyModule } from "@narrativetrace/nestjs";
       AutoProxyModule.forRoot({ onRequestComplete });`,
    ],
    [
      "Angular: provideNarrativeTrace hands each navigation's tree to onTraceCapture",
      `import { provideNarrativeTrace } from "@narrativetrace/angular";
       provideNarrativeTrace({ captureOnNavigation: true, onTraceCapture });`,
    ],
    [
      "Angular: TraceCaptureService captures the tree by hand",
      `constructor(private readonly capture: TraceCaptureService) {}`,
    ],
    [
      "React: useTraceCapture hands back the tree",
      `const { captureAndReset } = useTraceCapture();`,
    ],
    [
      "React Router: useNavigationCapture hands each navigation's tree to its callback",
      `useNavigationCapture((tree) => send(tree));`,
    ],
  ])("passes when the only sink is a framework integration's own — %s", (_name, wiring) => {
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { placeOrder: ["id"] });`,
          "src/app.ts": wiring,
        }),
      }),
    );
    expect(finding.status).toBe("pass");
  });

  test("still fails on AutoProxyModule.forRoot() with no completion hook or pipeline: nothing drains it", () => {
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles({
          "src/wire.ts": `traceObject(service, context, { placeOrder: ["id"] });`,
          "src/app.module.ts": `import { AutoProxyModule } from "@narrativetrace/nestjs";
            AutoProxyModule.forRoot({ serviceName: "orders" });`,
        }),
      }),
    );
    expect(finding.status).toBe("fail");
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

  test("with no logger declared, the fix carries the default logger row: pino, installed and wired", () => {
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles(UNSUNK),
        manifests: declaring({ express: "5" }),
        packageManager: "pnpm",
        installedPackages: withPackages({ "@narrativetrace/core-node": pkg({ version: "4.5.6" }) }),
      }),
    );
    expect(finding.status).toBe("fail");
    expect(finding.fix).toContain(
      "This project declares no logger, so the default is pino: pnpm add @narrativetrace/pino@4.5.6 @narrativetrace/core@4.5.6 @narrativetrace/observability@4.5.6 pino",
    );
    expect(finding.fix.endsWith(wiringSnippet(PINO_FIXTURE))).toBe(true);
    const fields = new Map([[DOCTOR_REPORT_FIELD, JSON.stringify(finding)]]);
    expect(valueFreeViolations(fields)).toEqual([]);
  });

  test.each([
    ["pino", "config.pino-consumer"],
    ["winston", "config.winston-consumer"],
    ["@opentelemetry/api", "config.opentelemetry-consumer"],
  ])("with %s declared, the fix points at that logger's own check instead", (logger, check) => {
    const finding = checkSilentSink(
      snapshot({ sourceFiles: withFiles(UNSUNK), manifests: declaring({ [logger]: "1" }) }),
    );
    expect(finding.fix).toContain(`This project declares ${logger}: apply ${check}'s fix.`);
    expect(finding.fix).not.toContain("the default is pino");
  });

  test("the default logger's fix is the fix it accepts: the pino snippet dropped in passes", () => {
    const finding = checkSilentSink(
      snapshot({
        sourceFiles: withFiles({ ...UNSUNK, "src/pipeline.ts": wiringSnippet(PINO_FIXTURE) }),
        manifests: declaring({}),
      }),
    );
    expect(finding.status).toBe("pass");
  });
});
