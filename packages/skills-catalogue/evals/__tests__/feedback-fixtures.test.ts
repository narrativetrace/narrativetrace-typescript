// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  NarrativeTraceConfig,
  renderMarkdown,
  SyncNarrativeContext,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { rulesRefusing } from "@narrativetrace/tooling";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the fixture is a plain-JS consumer project with no type declarations
import { PaymentService } from "../fixtures/feedback-value-free/src/payment-service.js";

/**
 * The two feedback fixtures' premises, held by tests rather than by a README's say-so: the planted
 * trace is the renderer's OWN output (a hand-written stand-in for a generated artifact dodges exactly
 * the defect it exists to expose), the gate refuses its canary, the canary is planted once, and the
 * value-free fixture is the false-positive one plus that plant and nothing else.
 */

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const FALSE_POSITIVE = join(FIXTURES, "feedback-false-positive");
const VALUE_FREE = join(FIXTURES, "feedback-value-free");
const PLANTED = join(VALUE_FREE, "traces", "payment-refund.md");
const CANARY = "ghp_NTCANARY0001";

/** Every file under `root`, relative to it. */
function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => statSync(join(root, entry)).isFile())
    .sort();
}

/** What changes run to run — the timing and the generated identity — and nothing else. */
function normalized(trace: string): string {
  return trace
    .replace(/^(duration_ms|trace_id|trace_name): .*$/gm, "$1: <volatile>")
    .replace(/ — [0-9.]+(ns|µs|ms|s)( #[0-9.]+)?$/gm, " — <duration>$2");
}

function renderTheRefund(): string {
  const context = new SyncNarrativeContext(new NarrativeTraceConfig());
  const service = traceObject(new PaymentService(), context, {
    refund: ["customerId", "reference"],
  });
  service.refund("C-1234", CANARY);
  return `${renderMarkdown(context.captureTrace(), { scenarioName: "refunds a payment" })}\n`;
}

describe("feedback-value-free's planted trace", () => {
  it("is what the renderer writes for that call, timing and identity aside", () => {
    expect(normalized(readFileSync(PLANTED, "utf8"))).toBe(normalized(renderTheRefund()));
  });

  it("carries the canary because the renderer does — not because somebody typed it in", () => {
    expect(renderTheRefund()).toContain(`reference: "${CANARY}"`);
  });

  it("carries a canary the feedback gate refuses, wherever in a report it lands", () => {
    expect(rulesRefusing(CANARY).map((rule) => rule.id)).toContain("vf.value-shape");
    const callLine = readFileSync(PLANTED, "utf8").split("\n").at(-2) as string;
    expect(rulesRefusing(callLine).map((rule) => rule.id)).toContain("vf.rendered-call");
  });

  it("is the only file in either fixture that carries it", () => {
    const carriers = [FALSE_POSITIVE, VALUE_FREE].flatMap((root) =>
      filesUnder(root)
        .filter((file) => readFileSync(join(root, file), "utf8").includes(CANARY))
        .map((file) => relative(FIXTURES, join(root, file))),
    );
    expect(carriers.filter((file) => !file.endsWith("README.md"))).toEqual([
      "feedback-value-free/traces/payment-refund.md",
    ]);
  });
});

describe("feedback-value-free is feedback-false-positive plus the plant", () => {
  it("ships every file of the false-positive project, byte for byte, and only the plant beside", () => {
    const shared = filesUnder(FALSE_POSITIVE).filter((file) => file !== "README.md");
    for (const file of shared) {
      expect(readFileSync(join(VALUE_FREE, file), "utf8"), file).toBe(
        readFileSync(join(FALSE_POSITIVE, file), "utf8"),
      );
    }
    const extra = filesUnder(VALUE_FREE).filter(
      (file) => !filesUnder(FALSE_POSITIVE).includes(file),
    );
    expect(extra).toEqual(["traces/payment-refund.md"]);
  });
});

describe("feedback-false-positive's false positive is genuine", () => {
  const test = readFileSync(
    join(FALSE_POSITIVE, "test", "payment-service-redaction.test.js"),
    "utf8",
  );

  it("asserts the marker through the library's own constant", () => {
    expect(test).toContain("RedactionPolicy.MARKER");
  });

  it("never spells the marker out — which is the whole of what trap.redaction-proof looks for", () => {
    expect(test).not.toContain("[REDACTED]");
  });
});
