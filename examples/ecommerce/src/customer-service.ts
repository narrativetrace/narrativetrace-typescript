// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { onError, traced } from "@narrativetrace/proxy";
import type { Customer } from "./domain.js";

export interface CustomerService {
  findCustomer(customerId: string): Customer;
}

const CUSTOMERS: ReadonlyMap<string, Customer> = new Map([
  ["C1", { id: "C1", name: "Alice", tier: "gold" }],
  ["C2", { id: "C2", name: "Bob", tier: "standard" }],
  ["C3", { id: "C3", name: "Charlie", tier: "platinum" }],
]);

export class InMemoryCustomerService implements CustomerService {
  @traced("customerId")
  @onError("Customer {customerId} not found")
  findCustomer(customerId: string): Customer {
    const customer = CUSTOMERS.get(customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${customerId}`);
    }
    return customer;
  }
}
