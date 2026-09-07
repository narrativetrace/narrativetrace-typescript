// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import * as barrel from "../src/index.js";

describe("@narrativetrace/pino barrel exports", () => {
  test("re-exports createPinoMixin", () => {
    expect(barrel.createPinoMixin).toBeDefined();
    expect(typeof barrel.createPinoMixin).toBe("function");
  });

  test("re-exports createPinoEventConsumer", () => {
    expect(barrel.createPinoEventConsumer).toBeDefined();
    expect(typeof barrel.createPinoEventConsumer).toBe("function");
  });
});
