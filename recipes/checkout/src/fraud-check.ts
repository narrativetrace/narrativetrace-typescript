// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/fraud-check.ts
/** Scores an order before the card is charged. */
export interface FraudCheckService {
  approve(customerId: string, amountCents: number): Promise<boolean>;
}

/** Orders above this amount are refused. */
export const FRAUD_LIMIT_CENTS = 100_000;

/** A rule-based check that answers after one asynchronous hop, like a call to a scoring service. */
export class RuleBasedFraudCheck implements FraudCheckService {
  async approve(_customerId: string, amountCents: number): Promise<boolean> {
    await Promise.resolve();
    return amountCents <= FRAUD_LIMIT_CENTS;
  }
}
