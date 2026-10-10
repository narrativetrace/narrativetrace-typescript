// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** What we know about a customer's card: the currency it is charged in. */
export class CustomerDirectory {
  constructor(cards = { "C-2041": "CHF", "C-7": "EUR" }) {
    this.cards = cards;
  }

  cardCurrencyOf(customerId) {
    return this.cards[customerId] ?? "EUR";
  }
}
