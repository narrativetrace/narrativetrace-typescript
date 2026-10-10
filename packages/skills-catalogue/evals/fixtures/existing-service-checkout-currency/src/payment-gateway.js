// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** The card network: an authorization holds the money, a confirmation captures it. */
export class PaymentGateway {
  authorize(invoiceId, amountCents, currency) {
    if (amountCents <= 0) throw new RangeError(`nothing to authorize for ${invoiceId}`);
    return { authorizationId: `AUTH-${invoiceId}`, amountCents, currency };
  }

  confirm(authorizationId) {
    return { authorizationId, status: "captured" };
  }
}
