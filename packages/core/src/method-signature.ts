// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ParameterCapture } from "./parameter-capture.js";

/**
 * Identifies a traced call and the arguments captured for it.
 *
 * INTENT: the "who was called with what" half of a {@link TraceNode}. `parameters` are already
 * rendered/redacted {@link ParameterCapture}s (not live values). `narration` carries the resolved
 * `@narrated` template for a friendly line; `errorContext` the `@onError` template, both optional.
 */
export interface MethodSignature {
  readonly className: string;
  readonly methodName: string;
  readonly parameters: readonly ParameterCapture[];
  readonly narration?: string;
  readonly errorContext?: string;
}

/**
 * Optional narration/error-context templates for {@link methodSignature}, kept separate from the
 * required positional arguments so callers can omit them entirely.
 */
export interface MethodSignatureOptions {
  readonly narration?: string;
  readonly errorContext?: string;
}

/**
 * Builds a frozen {@link MethodSignature}, defensively copying `parameters`.
 *
 * @param className declaring class (or module) of the traced method.
 * @param methodName the invoked method's name.
 * @param parameters already-captured, render-ready arguments; copied so the source array is safe to mutate.
 * @param options optional `narration`/`errorContext`; each is included only when defined.
 */
export function methodSignature(
  className: string,
  methodName: string,
  parameters: readonly ParameterCapture[],
  options?: MethodSignatureOptions,
): MethodSignature {
  return Object.freeze({
    className,
    methodName,
    parameters: Object.freeze([...parameters]),
    ...(options?.narration !== undefined ? { narration: options.narration } : {}),
    ...(options?.errorContext !== undefined ? { errorContext: options.errorContext } : {}),
  });
}
