// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import {
  exportJson,
  methodSignature,
  parameterCapture,
  renderMarkdown,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core";
import { bench, describe } from "vitest";

function buildTree(breadth: number, depth: number): TraceTree {
  function buildNodes(d: number): ReturnType<typeof traceNode>[] {
    if (d === 0) return [];
    const nodes = [];
    for (let i = 0; i < breadth; i++) {
      const params = [
        parameterCapture("id", `"item-${i}"`, false),
        parameterCapture("qty", String(i + 1), false),
      ];
      const sig = methodSignature(`Class${d}`, `method${i}`, params);
      nodes.push(traceNode(sig, returned(`"result-${i}"`), buildNodes(d - 1), i * 10));
    }
    return nodes;
  }
  return traceTree(buildNodes(depth));
}

const smallTree = buildTree(2, 2); // 2+4 = 6 nodes
const mediumTree = buildTree(3, 3); // 3+9+27 = 39 nodes
const largeTree = buildTree(4, 4); // 4+16+64+256 = 340 nodes

describe("markdown renderer", () => {
  bench("small trace (6 nodes)", () => {
    renderMarkdown(smallTree, { scenarioName: "small" });
  });

  bench("medium trace (39 nodes)", () => {
    renderMarkdown(mediumTree, { scenarioName: "medium" });
  });

  bench("large trace (340 nodes)", () => {
    renderMarkdown(largeTree, { scenarioName: "large" });
  });
});

describe("JSON export", () => {
  bench("small trace (6 nodes)", () => {
    exportJson(smallTree, { scenario: "small" });
  });

  bench("medium trace (39 nodes)", () => {
    exportJson(mediumTree, { scenario: "medium" });
  });

  bench("large trace (340 nodes)", () => {
    exportJson(largeTree, { scenario: "large" });
  });
});
