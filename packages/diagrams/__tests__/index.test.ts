// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import { renderMermaidSequence, renderPlantUmlSequence } from "../src/index.js";

test("barrel re-exports renderMermaidSequence", () => {
  expect(renderMermaidSequence).toBeTypeOf("function");
});

test("barrel re-exports renderPlantUmlSequence", () => {
  expect(renderPlantUmlSequence).toBeTypeOf("function");
});
