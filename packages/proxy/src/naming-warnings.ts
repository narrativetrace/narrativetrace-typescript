// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * One-time configuration warnings of `traceObject`.
 *
 * INTENT: the TypeScript runtime reads neither a plain object's class name nor any parameter
 * name, so a trace that skipped that configuration narrates as `Object.<method>(arg0)` — a string
 * the platform and the OTel bridge show to someone else. Each condition says so once per process,
 * on `console.warn`, and goes quiet only when the configuration it names is supplied.
 */

// The package compiles without DOM or Node typings; `console` exists in every runtime it runs in.
declare const console: { warn(message: string): void };

const warned = new Set<string>();

function warnOnce(condition: string, message: string): void {
  if (warned.has(condition)) return;
  warned.add(condition);
  console.warn(`[narrativetrace] ${message}`);
}

/** Warns that a target's class resolved to `Object` with no `className` override. */
export function warnObjectClassName(): void {
  warnOnce(
    "object-class-name",
    "traceObject: the target is a plain object, so every span reads Object.<method>. " +
      "Trace a class instance, or pass { className: 'YourService' } — the runtime cannot name it for you.",
  );
}

/** Warns that a method with parameters is traced with no parameter names. */
export function warnUnnamedParameters(className: string, methodName: string): void {
  warnOnce(
    "unnamed-parameters",
    `traceObject: ${className}.${methodName} takes parameters but no names were given, so they read arg0, arg1… ` +
      "The runtime reads no names from source: pass { methods: { " +
      `${methodName}: { params: ['…'] } } } or use @traced('…').`,
  );
}
