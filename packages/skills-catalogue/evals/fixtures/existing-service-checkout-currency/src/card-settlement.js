// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Settles an authorized card payment by confirming it with the gateway. */
export class CardSettlement {
  constructor(gateway) {
    this.gateway = gateway;
  }

  settle(authorization) {
    const confirmation = this.gateway.confirm(authorization.authorizationId);
    return { status: confirmation.status === "captured" ? "paid" : "failed" };
  }
}
