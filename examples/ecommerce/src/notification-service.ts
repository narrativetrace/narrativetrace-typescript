// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";

export interface NotificationService {
  notifyOrderPlaced(customerId: string, orderId: string): Promise<boolean>;
}

export class StubNotificationService implements NotificationService {
  readonly sent: Array<{ customerId: string; orderId: string }> = [];

  @traced("customerId", "orderId")
  async notifyOrderPlaced(customerId: string, orderId: string): Promise<boolean> {
    this.sent.push({ customerId, orderId });
    return true;
  }
}
