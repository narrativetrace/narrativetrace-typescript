// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { requireNonBlank } from "./guards.js";

/**
 * A DDD bounded context declared in the glossary, mapped to source-path prefixes.
 *
 * INTENT: contexts scope term identity — the same normalized term may exist independently in two
 * contexts with different definitions and translations. Prefixes are matched delimiter-aware by
 * the context resolver, so `packages/billing` never claims `packages/billingx`.
 *
 * @remarks The `packages` name is the glossary artifact's own vocabulary, shared with the Java
 * reference where the values are Java package names. In this runtime the values are module or
 * directory prefixes (`packages/billing`, `@acme/billing`, `src/billing`) — the platform
 * equivalent. Keeping the name identical keeps `glossary.json` byte-compatible across runtimes.
 */
export interface BoundedContext {
  /** Context name, unique within a glossary; never blank. */
  readonly name: string;
  /** Source-path prefixes owned by this context; may be empty, never `undefined`. */
  readonly packages: readonly string[];
  /** Human-written summary of the context's domain; absent — never `null` — when unwritten. */
  readonly description?: string;
}

/**
 * Builds a frozen {@link BoundedContext}, defensively copying `packages`.
 *
 * @param name context name, unique within a glossary; must contain a non-whitespace character.
 * @param packages source-path prefixes owned by this context; copied, so the source array stays
 * safe to mutate. An empty list is valid — the `_unassigned` fallback context declares none.
 * @param description optional human-written summary; omitted when `undefined`.
 * @returns the frozen context record.
 * @throws {TypeError} if `name` is blank, or if any prefix is blank — a blank prefix is a prefix
 * of every path and would silently swallow the whole repository into one context.
 * @example
 * ```ts
 * boundedContext("billing", ["packages/billing"], "Charging, invoicing, funds");
 * ```
 */
export function boundedContext(
  name: string,
  packages: readonly string[],
  description?: string,
): BoundedContext {
  requireNonBlank(name, "context name");
  for (const prefix of packages) {
    requireNonBlank(prefix, `package prefix of context '${name}'`);
  }
  return Object.freeze({
    name,
    packages: Object.freeze([...packages]),
    ...(description !== undefined ? { description } : {}),
  });
}
