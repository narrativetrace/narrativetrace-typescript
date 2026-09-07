// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
type AnyFn = (...args: never[]) => unknown;

const redactedParams = new WeakMap<AnyFn, Set<number>>();

/**
 * Method decorator that redacts sensitive parameter values from the trace by position.
 *
 * INTENT: apply this to keep secrets (passwords, tokens, card data) out of captures and out of
 * `@narrated`/`@onError` templates — a redacted parameter renders as the redaction marker in
 * both places, so it cannot leak through a template even though the raw argument is still passed
 * to the real method untouched.
 *
 * @param paramIndices zero-based positions of the parameters to redact; pass several to redact
 * multiple (e.g. `@notTraced(1, 2)`).
 *
 * @remarks Redaction is by index, so it survives parameter renaming but must be kept in sync
 * with the method's positional signature.
 */
export function notTraced(...paramIndices: number[]) {
  return <T extends (...args: never[]) => unknown>(
    method: T,
    _context: ClassMethodDecoratorContext,
  ): T => {
    redactedParams.set(method as AnyFn, new Set(paramIndices));
    return method;
  };
}

export function getRedactedParams(method: AnyFn): Set<number> | undefined {
  return redactedParams.get(method);
}
