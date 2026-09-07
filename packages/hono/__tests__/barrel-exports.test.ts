// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import * as barrel from "../src/index.js";

describe("@narrativetrace/hono barrel exports", () => {
  test("re-exports narrativeTrace", () => {
    expect(barrel.narrativeTrace).toBeDefined();
    expect(typeof barrel.narrativeTrace).toBe("function");
  });

  test("re-exports extractRequestInfo", () => {
    expect(barrel.extractRequestInfo).toBeDefined();
    expect(typeof barrel.extractRequestInfo).toBe("function");
  });
});
