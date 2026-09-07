// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Injectable } from "@nestjs/common";

@Injectable()
export class PaymentService {
  charge(customerId: string, amount: number) {
    if (amount <= 0) throw new Error("Amount must be positive");
    return { transactionId: `TXN-${Date.now()}`, customerId, amount };
  }
}
