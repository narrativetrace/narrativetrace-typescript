// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import type { ProxyOptions } from "../src/index.js";
import { traceObject } from "../src/index.js";

test("exports traceObject and ProxyOptions", () => {
  const opts: ProxyOptions = { includeReturnValues: true };
  expect(opts.includeReturnValues).toBe(true);
  expect(typeof traceObject).toBe("function");
});
