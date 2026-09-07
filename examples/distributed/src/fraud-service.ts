// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export type FraudResult = { readonly approved: boolean; readonly riskScore: number };

export interface FraudService {
  evaluate(customerId: string, amount: number): FraudResult;
}

export class InMemoryFraudService implements FraudService {
  evaluate(customerId: string, amount: number): FraudResult {
    if (customerId === "C3") return { approved: false, riskScore: 0.9 };
    if (amount > 1000) return { approved: false, riskScore: 0.8 };
    return { approved: true, riskScore: 0.1 };
  }
}
