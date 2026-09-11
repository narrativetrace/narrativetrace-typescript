// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Shared storage for the zero-based parameter indices a `@notTraced(...)` decorator marks for
 * redaction, keyed by the decorated method function's own identity.
 *
 * INTENT: `@notTraced` itself lives in `@narrativetrace/proxy` (`not-traced.ts`) — decorators are
 * a proxy-package concern — but more than one capture path needs to read the decision it records.
 * `traceObject`'s Proxy-based capture (proxy package) and NestJS's prototype-mutating auto-wrap
 * (`@narrativetrace/nestjs`, which does not and should not depend on `@narrativetrace/proxy` at
 * runtime) both already depend on `@narrativetrace/core`, so the storage lives here where both
 * can reach it without a new cross-package dependency. `@narrativetrace/proxy` re-exports
 * {@link getRedactedParams} from its own `not-traced.js` so existing call sites there are
 * unaffected by the move.
 *
 * @remarks A method function is redacted-by-index only if this exact function object was ever
 * decorated — an identical-looking method on a different class, or a method whose reference
 * changed (e.g. reassigned after decoration), is never confused with it, because the key is
 * identity, not name.
 */
const redactedParams = new WeakMap<Function, ReadonlySet<number>>();

/**
 * Records which positional parameters of `method` a `@notTraced(...paramIndices)` decorator
 * marked for redaction.
 *
 * INTENT: called once, at decoration time, by `@narrativetrace/proxy`'s `notTraced` decorator —
 * production code should otherwise never need to call this directly.
 *
 * @param method the exact decorated method function, used as the lookup key.
 * @param paramIndices zero-based positions to redact; stored as a fresh, frozen set.
 */
export function registerRedactedParams(method: Function, paramIndices: readonly number[]): void {
  redactedParams.set(method, new Set(paramIndices));
}

/**
 * The redacted parameter indices previously recorded for `method` via
 * {@link registerRedactedParams}, or `undefined` if `method` was never decorated.
 *
 * @param method the method function to look up, matched by identity.
 */
export function getRedactedParams(method: Function): ReadonlySet<number> | undefined {
  return redactedParams.get(method);
}
