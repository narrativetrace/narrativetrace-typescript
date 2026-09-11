// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdownBody } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";

const test = createNarrativeTest();

/**
 * Mirrors `index.js`'s `OrderService` verbatim (documentation/first-10-minutes.md § 2). Kept as
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

  // The page's step-3 output block (documentation/first-10-minutes.md) is exactly this string —
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
