// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Sends a short message to a customer. Messages are queued here; delivery happens elsewhere. */
export class NotificationService {
  sent = [];

  send(customerId, message) {
    this.sent.push({ customerId, message });
  }
}
