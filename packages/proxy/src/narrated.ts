// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
type AnyFn = (...args: never[]) => unknown;

/** Constructor of an Error subtype used to filter which @onError applies to a thrown value. */
export type ErrorClass = abstract new (...args: never[]) => Error;

/** One @onError declaration: a template plus the optional exception type it applies to. */
export interface OnErrorSpec {
  readonly exception?: ErrorClass;
  readonly template: string;
}

const narrationTemplates = new WeakMap<AnyFn, string>();
const errorSpecs = new WeakMap<AnyFn, OnErrorSpec[]>();

/**
 * Method decorator that attaches a human-readable narration line to a traced method's entry span.
 *
 * INTENT: use this to give a method a business-meaningful sentence in the trace instead of a bare
 * signature. The template is resolved at entry against the method's named parameters (see
 * {@link traced}) — `{customerId}` and property paths like `{order.total}` are substituted; a
 * redacted parameter (see `@notTraced`) resolves to the redaction marker, and an unresolvable
 * placeholder falls back to its literal `{placeholder}` text.
 *
 * @param template narration string with `{paramName}` / `{path.to.value}` placeholders.
 */
export function narrated(template: string) {
  return <T extends (...args: never[]) => unknown>(
    method: T,
    _context: ClassMethodDecoratorContext,
  ): T => {
    narrationTemplates.set(method as AnyFn, template);
    return method;
  };
}

/**
 * `@onError("template")` is a catch-all; `@onError(SomeError, "template")` applies only when the
 * thrown value is an instance of `SomeError`. Repeatable — stack several to cover distinct types;
 * the one matching the thrown type most specifically wins at throw time (port of Java @OnError).
 */
export function onError(template: string): ReturnType<typeof onErrorDecorator>;
/**
 * Typed form: the narration applies only when the thrown value is an instance of `exception`.
 * @param exception the error type this declaration matches (matched via `instanceof`).
 * @param template narration string, resolved against the method's named parameters at throw time.
 */
export function onError(
  exception: ErrorClass,
  template: string,
): ReturnType<typeof onErrorDecorator>;
/**
 * Implementation signature for the {@link onError} overloads — pass either `(template)` for a
 * catch-all or `(exception, template)` for a type-specific declaration.
 */
export function onError(a: string | ErrorClass, b?: string) {
  const spec: OnErrorSpec =
    typeof a === "string" ? { template: a } : { exception: a, template: b as string };
  return onErrorDecorator(spec);
}

function onErrorDecorator(spec: OnErrorSpec) {
  return <T extends (...args: never[]) => unknown>(
    method: T,
    _context: ClassMethodDecoratorContext,
  ): T => {
    const list = errorSpecs.get(method as AnyFn) ?? [];
    list.push(spec);
    errorSpecs.set(method as AnyFn, list);
    return method;
  };
}

export function getNarration(method: AnyFn): string | undefined {
  return narrationTemplates.get(method);
}

export function getErrorSpecs(method: AnyFn): readonly OnErrorSpec[] {
  return errorSpecs.get(method) ?? [];
}
