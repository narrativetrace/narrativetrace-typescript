// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { isNoAutoProxy, NoAutoProxy } from "../src/no-auto-proxy.decorator.js";

describe("@NoAutoProxy()", () => {
  test("class-level decorator marks class as excluded", () => {
    @NoAutoProxy()
    class Excluded {}
    expect(isNoAutoProxy(Excluded)).toBe(true);
  });

  test("method-level decorator marks method as excluded", () => {
    class Svc {
      @NoAutoProxy()
      healthCheck() {}
    }
    expect(isNoAutoProxy(Svc.prototype, "healthCheck")).toBe(true);
  });

  test("undecorated class is not excluded", () => {
    class Plain {}
    expect(isNoAutoProxy(Plain)).toBe(false);
  });

  test("undecorated method is not excluded", () => {
    class Svc {
      doWork() {}
    }
    expect(isNoAutoProxy(Svc.prototype, "doWork")).toBe(false);
  });

  test("decorated method does not affect other methods", () => {
    class Svc {
      @NoAutoProxy()
      healthCheck() {}
      doWork() {}
    }
    expect(isNoAutoProxy(Svc.prototype, "healthCheck")).toBe(true);
    expect(isNoAutoProxy(Svc.prototype, "doWork")).toBe(false);
  });
});
