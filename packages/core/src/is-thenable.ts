// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Whether `value` has a callable `then` — the duck-typed thenable/future test shared by rendering,
 * proxy exit and async scope settlement.
 *
 * @remarks Reading `.then` invokes an accessor regardless of enumerability, so this check must be
 * exception-safe on its own: a hostile getter (a custom future/promise subclass, a Proxy) must not
 * escape detection itself and poison the caller before any renderer or exit guard runs (no-poison
 * contract, findings 2/3/7).
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  try {
    return typeof (value as { then?: unknown }).then === "function";
  } catch {
    return false;
  }
}
