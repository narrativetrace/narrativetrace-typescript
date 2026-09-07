// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";
import { ExternalServiceError } from "./external-service-error.js";
import type { NotificationService } from "./notification-service.js";

/**
 * Decorator over a real notification service that starts failing from the `failOnCall`-th call —
 * the "flaky external dependency" of demo scenario 3.
 */
export class FlakyNotificationService implements NotificationService {
  private callCount = 0;

  constructor(
    private readonly delegate: NotificationService,
    private readonly failOnCall: number,
  ) {}

  @traced("customerId", "orderId")
  notifyOrderPlaced(customerId: string, orderId: string): Promise<boolean> {
    this.callCount++;
    if (this.callCount >= this.failOnCall) {
      throw new ExternalServiceError(
        `External notification service unavailable (call #${this.callCount})`,
      );
    }
    return this.delegate.notifyOrderPlaced(customerId, orderId);
  }
}
