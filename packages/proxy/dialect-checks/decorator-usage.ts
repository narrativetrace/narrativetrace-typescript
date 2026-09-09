// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Type-level fixture for the dual decorator dialect: this file applies all four decorators the
 * way a consumer writes them, importing the BUILT declarations (`dist/`), and is compiled twice
 * with `tsc --noEmit` — once under the standard TC39 dialect (tsconfig.dialect-tc39.json) and
 * once under legacy `experimentalDecorators` (tsconfig.dialect-legacy.json). A published `.d.ts`
 * that satisfies only one dialect fails the other compilation, which fails `test`/`coverage`.
 *
 * Never imported at runtime — it exists only to be type-checked.
 */
import { narrated, notTraced, onError, traced } from "../dist/index.js";

export class DialectFixtureService {
  @traced("customerId", "amount", "cardToken")
  @narrated("Charging {amount} to customer {customerId}")
  @onError("Charge failed for customer {customerId}")
  @onError(RangeError, "Amount out of range for customer {customerId}")
  @notTraced(2)
  charge(customerId: string, amount: number, cardToken: string): string {
    return `${customerId}:${amount}:${cardToken.length}`;
  }

  @traced()
  @narrated("Refunding")
  refund(): void {}
}
