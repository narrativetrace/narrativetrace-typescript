// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import { postToCollector, renderToConsole } from "../src/index.js";

test("barrel re-exports renderToConsole", () => {
  expect(renderToConsole).toBeTypeOf("function");
});

test("barrel re-exports postToCollector", () => {
  expect(postToCollector).toBeTypeOf("function");
});
