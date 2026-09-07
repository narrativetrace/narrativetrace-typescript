// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { renderStructured } from "../src/rendered-value.js";
import { renderValue } from "../src/value-renderer.js";

/**
 * TODO 46 (container-redaction audit), property half. Pins the bug *class* rather than one
 * reported instance: for an arbitrary stack of the containers this renderer recognizes
 * (array/Set/Map/plain-object), a redacted leaf never survives into the rendered text, at
 * whatever depth the stack buries it.
 */

const SECRET = "arbitrary-secret-payload";

class Holder {
  static readonly notTraced = ["secret"];
  readonly secret = SECRET;
}

/** One layer of container wrapping a value, each a distinct dispatch path in the renderer. */
type Layer = (inner: unknown) => unknown;

const layerArb: fc.Arbitrary<Layer> = fc.constantFrom<Layer>(
  (inner) => [inner],
  (inner) => new Set([inner]),
  (inner) => new Map([["k", inner]]),
  (inner) => ({ nested: inner }),
);

const stackArb = fc.array(layerArb, { minLength: 0, maxLength: 4 });

function wrap(stack: readonly Layer[], leaf: unknown): unknown {
  return stack.reduceRight((acc, layer) => layer(acc), leaf);
}

test("renderValue never leaks the secret through any stack of recognized containers", () => {
  fc.assert(
    fc.property(stackArb, (stack) => {
      const rendered = renderValue(wrap(stack, new Holder()));
      expect(rendered).not.toContain(SECRET);
    }),
  );
});

test("renderStructured never leaks the secret through any stack of recognized containers", () => {
  fc.assert(
    fc.property(stackArb, (stack) => {
      const rendered = JSON.stringify(
        renderStructured(wrap(stack, new Holder()), { maxDepth: stack.length + 3 }),
      );
      expect(rendered).not.toContain(SECRET);
    }),
  );
});
