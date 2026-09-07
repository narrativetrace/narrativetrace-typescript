// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Tier B fuzz target 2 of 2: JSON emit — the canonical chapter-tree envelope, well-formed
// and schema-valid for whatever a captured value or narration contained.
//
// INTENT: see value-renderer.fuzz.mjs's header for why this is plain ESM rather than the
// TypeScript this package otherwise uses. __tests__/fuzz-regression.test.ts imports this
// same file directly and replays the seed corpus through it in `pnpm run check`.
import {
  exportJson,
  methodSignature,
  parameterCapture,
  renderValue,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core";

export function fuzz(data) {
  const text = data.toString("utf-8");
  const rendered = renderValue(text);
  const node = traceNode(
    methodSignature("CardRepository", "findByNumber", [parameterCapture("probe", rendered, false)]),
    returned(rendered),
    [],
    1,
  );
  const tree = traceTree([node]);

  const json = exportJson(tree, { scenario: "fuzz" });
  // Must parse: an escaper that is merely plausible passes every eyeball test until the
  // day it does not. JSON.parse throwing is exactly the failure this target exists to find.
  JSON.parse(json);
}
