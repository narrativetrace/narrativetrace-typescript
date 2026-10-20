// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/accounts.ts
/** Signs a customer in before the checkout charges them. The parameter is named `password`. */
export interface CustomerAccounts {
  /**
   * @returns the session id the checkout carries for the rest of the request
   * @throws {RangeError} when the password is blank
   */
  signIn(customerId: string, password: string): string;
}

/** Accounts that accept any non-blank password, so the scenario needs no user store. */
export class InMemoryAccounts implements CustomerAccounts {
  signIn(customerId: string, password: string): string {
    if (password.trim() === "") {
      throw new RangeError("password must not be blank");
    }
    return `SESSION-${customerId}`;
  }
}
