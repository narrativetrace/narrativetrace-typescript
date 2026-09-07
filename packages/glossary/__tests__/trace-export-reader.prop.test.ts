// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  exportJson,
  methodSignature,
  parameterCapture,
  returned,
  type TraceNode,
  threw,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import fc from "fast-check";
import { expect, test } from "vitest";
import { readTraceExport, type TranslatableCall } from "../src/trace-export-reader.js";

const identifier = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,7}$/);

/** Values are the tokens translation must never touch, so they are drawn adversarially. */
const value = fc.oneof(
  fc.stringMatching(/^[ -~]{0,12}$/),
  fc.constantFrom('"C-BROKE"', "74.97", "insufficient fund", "cuenta", "→", "{ }", "null"),
);

const parameters = fc.array(
  fc.tuple(identifier, value).map(([name, rendered]) => parameterCapture(name, rendered, false)),
  { maxLength: 3 },
);

const outcome = fc.oneof(
  value.map((rendered) => returned(rendered)),
  fc.tuple(identifier, value).map(([type, message]) => threw(namedError(type, message))),
);

function namedError(type: string, message: string): Error {
  const error = new Error(message);
  error.name = type;
  return error;
}

const leaf = fc
  .tuple(identifier, identifier, parameters, outcome)
  .map(([className, methodName, params, result]) =>
    traceNode(methodSignature(className, methodName, params), result, []),
  );

const callTree: fc.Arbitrary<TraceNode> = fc.letrec<{ node: TraceNode }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    leaf,
    fc
      .tuple(identifier, identifier, parameters, outcome, fc.array(tie("node"), { maxLength: 3 }))
      .map(([className, methodName, params, result, children]) =>
        traceNode(methodSignature(className, methodName, params), result, children),
      ),
  ),
})).node;

function shapeOf(node: TraceNode): unknown {
  return {
    className: node.signature.className,
    methodName: node.signature.methodName,
    parameters: node.signature.parameters.map((p) => ({ name: p.name, value: p.renderedValue })),
    children: node.children.map(shapeOf),
  };
}

function readShapeOf(call: TranslatableCall): unknown {
  return {
    className: call.className,
    methodName: call.methodName,
    parameters: call.parameters.map((p) => ({ name: p.name, value: p.value })),
    children: call.children.map(readShapeOf),
  };
}

test("reading an exported trace recovers its shape, identifiers and values exactly", () => {
  fc.assert(
    fc.property(fc.array(callTree, { minLength: 1, maxLength: 3 }), identifier, (roots, name) => {
      const exported = exportJson(traceTree(roots), { scenario: name });

      const document = readTraceExport(exported);

      expect(document.scenario).toBe(name);
      expect(document.calls.map(readShapeOf)).toStrictEqual(roots.map(shapeOf));
    }),
    { numRuns: 200 },
  );
});
