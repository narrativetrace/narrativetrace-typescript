// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { ClientIp, EnduserId, HttpRoute, SessionId, TenantId } from "../src/branded-types.js";

describe("branded context types", () => {
  test("HttpRoute retains string value", () => {
    const route = "/api/orders" as HttpRoute;
    expect(route).toBe("/api/orders");
  });

  test("ClientIp retains string value", () => {
    const ip = "192.168.1.1" as ClientIp;
    expect(ip).toBe("192.168.1.1");
  });

  test("EnduserId retains string value", () => {
    const id = "user-42" as EnduserId;
    expect(id).toBe("user-42");
  });

  test("SessionId retains string value", () => {
    const id = "sess-abc" as SessionId;
    expect(id).toBe("sess-abc");
  });

  test("TenantId retains string value", () => {
    const id = "tenant-1" as TenantId;
    expect(id).toBe("tenant-1");
  });
});
