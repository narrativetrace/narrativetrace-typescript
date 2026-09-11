// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  getRedactedParams as getRegisteredRedactedParams,
  registerRedactedParams,
} from "@narrativetrace/core";
import { type DualMethodDecorator, methodDecorator } from "./decorator-dialect.js";

type AnyFn = (...args: never[]) => unknown;

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
 * @returns a decorator usable from both dialects — standard TC39 decorators and the legacy
 * `experimentalDecorators` dialect (NestJS, Angular); the dialect is detected at runtime from
 * the call shape. The non-decorator twin is `methods.<name>.notTraced` on {@link traceObject}.
 *
 * @remarks Redaction is by index, so it survives parameter renaming but must be kept in sync
 * with the method's positional signature. The underlying storage lives in
 * `@narrativetrace/core`'s `redacted-params-registry.js` (not here) so `@narrativetrace/nestjs`'s
 * prototype-mutating auto-wrap — which does not depend on this package — can honour the same
 * decorator without a new cross-package dependency; this module keeps the public decorator and
 * re-exports the read side so every existing call site here is unaffected by that move.
 */
export function notTraced(...paramIndices: number[]): DualMethodDecorator {
  return methodDecorator("notTraced", (method) => {
    registerRedactedParams(method, paramIndices);
  });
}

export function getRedactedParams(method: AnyFn): ReadonlySet<number> | undefined {
  return getRegisteredRedactedParams(method);
}
