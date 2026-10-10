// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export class PaymentService {
  charge(customerId, authToken, amount) {
    if (!authToken || !amount) throw new Error("a charge needs a token and an amount");
    return `PAY-${customerId}`;
  }

  refund(customerId, reference) {
    if (!reference) throw new Error("a refund needs the reference it reverses");
    return `REF-${customerId}`;
  }
}
