// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import type { TracingLevel } from "../src/index.js";
import { isActiveLevel } from "../src/index.js";

test("TracingLevel accepts narrative", () => {
  const level: TracingLevel = "narrative";
  expect(level).toBe("narrative");
});

test("isActiveLevel returns true for non-off levels", () => {
  expect(isActiveLevel("narrative")).toBe(true);
  expect(isActiveLevel("off")).toBe(false);
});
