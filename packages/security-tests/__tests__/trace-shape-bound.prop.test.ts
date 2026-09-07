// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { hostileTraceShapes } from "../src/corpus/hostile-corpus.js";
import { build } from "../src/corpus/trace-shapes.js";
import { everyOutput, renderers } from "../src/oracle/emitters.js";
import {
  everyJsonArtifactParses,
  isWellFormedMermaid,
  isWellFormedPlantUml,
  validatesAgainstChapterTreeSchema,
} from "../src/oracle/formats.js";
import { boundedSize, withinBudget } from "../src/oracle/oracles.js";

/**
 * A deep or cyclic `TraceNode` tree must not crash or hang any renderer or exporter — `TreeWalk`
 * (`packages/core/src/tree-walk.ts`) is the shared bound every one of them now goes through.
 * Mirrors Java's `TraceShapeBoundPropertyTest`.
 *
 * @llmNote Companion to `output-format.prop.test.ts` (target 3 of the parity document's fuzzing
 * list), scoped to the tree-shape corpus rather than the value corpus: those hostile-corpus
 * strings cases exercise a hostile *value* inside an otherwise ordinary one-node tree; this one
 * exercises a hostile *tree structure* around an ordinary value. Cross-port mirror of the
 * 2026-09-03 unbounded-tree-walk finding (Java golden source).
 */

describe("trace shape bound", () => {
  test("every trace shape leaves every format well-formed and bounded", () => {
    for (const shape of hostileTraceShapes()) {
      const tree = build(shape);
      const outputs = withinBudget(shape.id, () => everyOutput(tree));

      boundedSize(outputs);
      validatesAgainstChapterTreeSchema("renderer:json", outputs["renderer:json"] as string);
      isWellFormedMermaid("renderer:mermaid", outputs["renderer:mermaid"] as string);
      isWellFormedPlantUml("renderer:plantuml", outputs["renderer:plantuml"] as string);
      everyJsonArtifactParses(outputs);
    }
  });

  test("every cyclic trace shape carries the cycle marker, not merely avoids crashing", () => {
    for (const shape of hostileTraceShapes().filter((s) => s.kind === "cycle")) {
      const tree = build(shape);
      const outputs = renderers(tree);

      expect(outputs["renderer:mermaid"], shape.id).toContain("(cycle)");
      expect(outputs["renderer:plantuml"], shape.id).toContain("(cycle)");
      expect(outputs["renderer:markdown"], shape.id).toContain("(cycle)");
    }
  });
});
