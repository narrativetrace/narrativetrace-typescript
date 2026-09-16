// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect, it } from "vitest";

const test = createNarrativeTest();

/**
 * Mirrors `index.js`'s `OrderService` verbatim (documentation/sixty-seconds.md § 2). Kept as
 * its own tiny copy rather than imported: `index.js` is the hand-run script itself (importing it
 * would re-run its own `console.log`), and this class is small and stable enough that the two
 * copies drifting apart silently is not a realistic risk — `snippet-check` still guards the page
 * against `index.js`, independently of this file.
 */
class OrderService {
  placeOrder(customerId: string, productId: string, quantity: number): string {
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

test("places an order through the traced proxy", ({ narrativeContext }) => {
  const service = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  expect(service.placeOrder("C1", "P1", 2)).toBe("ORD-C1-P1-2");

  // The page's step-3 output block (documentation/sixty-seconds.md) is exactly this string —
  // the same `renderMarkdownBody` call `index.js` itself makes, not the `.md` artifact
  // `createNarrativeTest` writes above on teardown (that one carries YAML frontmatter the
  // console-run script never prints). Saved as its own file so `snippet-check`
  // (`mask=duration` in the marker) can embed it byte-stably regardless of this run's timing.
  const outputDir = join("narrativetrace-output", "sixty-seconds");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, "console-output.txt"),
    `${renderMarkdownBody(narrativeContext.captureTrace())}\n`,
    "utf-8",
  );
});

/**
 * `pid`, `hostname`, `time` and `span_id` are minted fresh — and different — on every real run,
 * the same way they would be for a reader who pastes and runs `index-with-logger.js` themselves;
 * this pins each to a fixed placeholder (the page's prose names them) purely so the captured
 * sample below stays byte-stable across regenerations, the same job `mask=duration` does for the
 * one field this normalizing can't touch without also hiding a real timing difference.
 */
function normalizeVolatileFields(text: string): string {
  let timeSeen = 0;
  return text
    .replace(/"time":\d+/g, () => `"time":${timeSeen++ === 0 ? 1789269258472 : 1789269258474}`)
    .replace(/"pid":\d+/g, '"pid":22805')
    .replace(/"hostname":"[^"]*"/g, '"hostname":"9a9362dce156"')
    .replace(/"span_id":"[0-9a-f]{16}"/g, '"span_id":"5bbbf25ced9a35c4"');
}

/**
 * `index-with-logger.js` (documentation/sixty-seconds.md § "Send it to your logger") is run as a
 * real child process — not imported and not mirrored — so the captured JSON is genuinely from
 * running the exact file the page embeds, with no second copy of its setup here to drift. Only the
 * trace id is fixed by the script itself (`FIXED_TRACEPARENT`, same as `nt.traceName`); everything
 * else volatile is normalized below, after the real run, once it has already proven the file works.
 */
it("logs through pino via the DualPathPipeline logger bridge", () => {
  const raw = execFileSync(process.execPath, ["index-with-logger.js"], {
    encoding: "utf-8",
  });

  expect(raw).toContain('"code.function":"placeOrder"');
  expect(raw).toContain('"nt.eventType":"method_enter"');
  expect(raw).toContain('"nt.eventType":"method_exit"');
  expect(raw).toContain("ORD-C1-P1-2");

  const outputDir = join("narrativetrace-output", "sixty-seconds");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, "console-output-with-logger.txt"),
    normalizeVolatileFields(raw),
    "utf-8",
  );
});
