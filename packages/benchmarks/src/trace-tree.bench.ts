// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  methodSignature,
  parameterCapture,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { bench, describe } from "vitest";

function buildLinearNodes(count: number) {
  const params = [parameterCapture("id", '"x"', false)];
  const nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push(traceNode(methodSignature("Svc", `op${i}`, params), returned('"ok"'), [], i));
  }
  return nodes;
}

describe("trace tree construction", () => {
  bench("10 nodes", () => {
    traceTree(buildLinearNodes(10));
  });

  bench("100 nodes", () => {
    traceTree(buildLinearNodes(100));
  });

  bench("1000 nodes", () => {
    traceTree(buildLinearNodes(1000));
  });
});
