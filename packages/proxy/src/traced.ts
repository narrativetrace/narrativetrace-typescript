// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type DualMethodDecorator, methodDecorator } from "./decorator-dialect.js";

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
 * @returns a decorator usable from both dialects — standard TC39 decorators and the legacy
 * `experimentalDecorators` dialect (NestJS, Angular); the dialect is detected at runtime from
 * the call shape. The non-decorator twin is `methods.<name>.params` (or the `paramNames`
 * argument) on {@link traceObject}.
 *
 * @example
 * ```ts
 * class OrderService {
 *   @traced("customerId", "productId", "quantity")
 *   placeOrder(customerId: string, productId: string, quantity: number) { ... }
 * }
 * ```
 */
export function traced(...names: string[]): DualMethodDecorator {
  return methodDecorator("traced", (method) => {
    paramNames.set(method, names);
  });
}

export function getTracedParamNames(method: AnyFn): readonly string[] | undefined {
  return paramNames.get(method);
}
