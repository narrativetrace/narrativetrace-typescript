// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import * as barrel from "../src/index.js";

describe("@narrativetrace/winston barrel exports", () => {
  test("re-exports createWinstonFormat", () => {
    expect(barrel.createWinstonFormat).toBeDefined();
    expect(typeof barrel.createWinstonFormat).toBe("function");
  });

  test("re-exports createWinstonEventConsumer", () => {
    expect(barrel.createWinstonEventConsumer).toBeDefined();
    expect(typeof barrel.createWinstonEventConsumer).toBe("function");
  });
});
