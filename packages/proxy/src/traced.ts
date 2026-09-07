// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
type AnyFn = (...args: never[]) => unknown;

const paramNames = new WeakMap<AnyFn, readonly string[]>();

/**
 * Method decorator that names a method's positional parameters for the trace.
 *
 * INTENT: apply this so captures and `@narrated`/`@onError` templates can refer to parameters
 * by meaningful names instead of `arg0`, `arg1`, … (parameter identifiers are erased at
 * runtime). Provide names in declaration order; extra parameters beyond the given names keep
 * their positional `argN` fallback. Names bind by identity of the decorated function, so
 * {@link traceObject} picks them up when it wraps the instance.
 *
 * @param names parameter names in positional order, matching the method's signature.
 *
 * @example
 * ```ts
 * class OrderService {
 *   @traced("customerId", "productId", "quantity")
 *   placeOrder(customerId: string, productId: string, quantity: number) { ... }
 * }
 * ```
 */
export function traced(...names: string[]) {
  return <T extends (...args: never[]) => unknown>(
    method: T,
    _context: ClassMethodDecoratorContext,
  ): T => {
    paramNames.set(method as AnyFn, names);
    return method;
  };
}

export function getTracedParamNames(method: AnyFn): readonly string[] | undefined {
  return paramNames.get(method);
}
