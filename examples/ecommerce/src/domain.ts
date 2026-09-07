// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export type CustomerTier = "standard" | "gold" | "platinum";

export type Customer = {
  readonly id: string;
  readonly name: string;
  readonly tier: CustomerTier;
};

export type Reservation = {
  readonly productId: string;
  readonly quantity: number;
};

export type PaymentConfirmation = {
  readonly transactionId: string;
  readonly amount: number;
};

export type OrderResult = {
  readonly orderId: string;
  readonly transactionId: string;
  readonly totalCharged: number;
  readonly itemCount: number;
};
