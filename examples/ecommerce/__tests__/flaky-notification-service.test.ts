// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import { ExternalServiceError } from "../src/external-service-error.js";
import { FlakyNotificationService } from "../src/flaky-notification-service.js";
import { StubNotificationService } from "../src/notification-service.js";

test("delegates until the configured call, then throws ExternalServiceError naming the call", async () => {
  const delegate = new StubNotificationService();
  const flaky = new FlakyNotificationService(delegate, 2);

  await expect(flaky.notifyOrderPlaced("C1", "ORD-1")).resolves.toBe(true);
  expect(delegate.sent).toHaveLength(1);
  expect(() => flaky.notifyOrderPlaced("C1", "ORD-2")).toThrow(ExternalServiceError);
  expect(() => flaky.notifyOrderPlaced("C1", "ORD-3")).toThrow(
    "External notification service unavailable (call #3)",
  );
  expect(delegate.sent).toHaveLength(1);
});
