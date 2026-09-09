// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
type AnyFn = (...args: never[]) => unknown;

/**
 * A method decorator callable from either decorator dialect TypeScript can compile.
 *
 * INTENT: `@traced`/`@narrated`/`@onError`/`@notTraced` must work identically in a project that
 * compiles standard TC39 decorators (TypeScript 5 default) and in one that compiles the legacy
 * `experimentalDecorators` dialect (NestJS, Angular) — the platforms where decorators are the
 * natural syntax. The two dialects call the decorator with different shapes; this type carries a
 * call signature for each, so the published declarations type-check under both compiler settings.
 *
 * @llmNote The dialect is detected at runtime from the call shape (see `methodDecorator`), never
 * from configuration — the same import serves both dialects with no setup. A call shape that is
 * neither dialect throws a `TypeError` naming the fix instead of silently recording nothing.
 */
export interface DualMethodDecorator {
  /** Standard TC39 dialect: `(method, context)`, returning the method unchanged. */
  <T extends AnyFn>(method: T, context: ClassMethodDecoratorContext): T;
  /** Legacy `experimentalDecorators` dialect: `(target, propertyKey, descriptor)`. */
  <T>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T>;
}

const CONFIG_FORM_HINT =
  "If this environment does not compile decorators at all, use the config form instead — " +
  "traceObject(target, context, { methods: { ... } }) expresses everything the decorators do " +
  "(see documentation/decorators-guide.md).";

function isDecoratorContext(candidate: unknown): candidate is ClassMethodDecoratorContext {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { kind?: unknown }).kind === "string"
  );
}

function applyStandard(
  name: string,
  register: (method: AnyFn) => void,
  method: unknown,
  context: ClassMethodDecoratorContext,
): unknown {
  if (context.kind !== "method" || typeof method !== "function") {
    throw new TypeError(
      `@${name} is a method decorator, but it was applied to a ${context.kind}. ` +
        `Move it onto a class method. ${CONFIG_FORM_HINT}`,
    );
  }
  register(method as AnyFn);
  return method;
}

function applyLegacy(
  name: string,
  register: (method: AnyFn) => void,
  descriptor: unknown,
): unknown {
  const method = (descriptor as TypedPropertyDescriptor<AnyFn> | undefined)?.value;
  if (typeof method !== "function") {
    throw new TypeError(
      `@${name} is a method decorator, but under experimentalDecorators it was applied to a ` +
        `member with no callable descriptor (a property or an accessor). ` +
        `Move it onto a class method. ${CONFIG_FORM_HINT}`,
    );
  }
  register(method);
  return descriptor;
}

function isLegacyPropertyCall(args: readonly unknown[]): boolean {
  return typeof args[1] === "string" || typeof args[1] === "symbol";
}

function unsupportedShape(name: string, args: readonly unknown[]): TypeError {
  return new TypeError(
    `@${name} was called with ${args.length} argument(s), which is neither the standard TC39 ` +
      "decorator shape (method, context) nor the legacy experimentalDecorators shape " +
      "(target, propertyKey, descriptor) — this environment likely does not compile decorators. " +
      CONFIG_FORM_HINT,
  );
}

function dispatch(name: string, register: (method: AnyFn) => void, args: unknown[]): unknown {
  // Standard TC39: (value, context) — context always carries a string `kind`.
  if (args.length === 2 && isDecoratorContext(args[1])) {
    return applyStandard(name, register, args[0], args[1]);
  }
  // Legacy experimentalDecorators: (target, propertyKey, descriptor) for methods/accessors;
  // a legacy *property* decoration passes only (target, propertyKey) — same fix, named directly.
  if (args.length === 3 || (args.length === 2 && isLegacyPropertyCall(args))) {
    return applyLegacy(name, register, args[2]);
  }
  throw unsupportedShape(name, args);
}

/**
 * Builds a method decorator that accepts both decorator dialects at runtime.
 *
 * INTENT: the four public decorators only ever *record metadata* keyed by the method function —
 * they never replace the method — so both dialects reduce to "find the method function, hand it
 * to `register`, return what the dialect expects back" (the method under TC39, the descriptor
 * under legacy). The dialect is detected from the call shape: a TC39 call passes a context object
 * with a string `kind` as the second argument; a legacy call passes the property key second and
 * the descriptor third.
 *
 * @param name decorator name used in error messages (`traced`, `narrated`, …).
 * @param register callback receiving the decorated method function to attach metadata to.
 * @returns the dual-dialect decorator.
 *
 * @remarks Any call shape that is neither dialect — including a decorator applied to a field,
 * getter, setter, or class — throws a `TypeError` naming the fix (move onto a method, or use the
 * config form on `traceObject`), because a silently ignored decorator is how a first-try user
 * concludes the library is broken.
 */
export function methodDecorator(
  name: string,
  register: (method: AnyFn) => void,
): DualMethodDecorator {
  const decorator = (...args: unknown[]): unknown => dispatch(name, register, args);
  return decorator as DualMethodDecorator;
}
