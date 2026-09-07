// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Glossary } from "./glossary.js";
import { requireNonBlank } from "./guards.js";
import { byKey } from "./text-order.js";

/**
 * Context that owns every source path no declared context claims.
 *
 * INTENT: harvesting must work with zero configuration — terms land here on day one and contexts
 * are adopted progressively, rather than the glossary requiring a full domain map up front.
 */
export const UNASSIGNED_CONTEXT = "_unassigned";

/**
 * Characters that end a path segment.
 *
 * INTENT: the boundary check is what makes prefix matching mean "owns", not "starts with". `/`
 * covers directory and scoped-package paths, `.` covers dotted module paths — the platform
 * equivalent of the Java runtime's package separator.
 */
const BOUNDARIES = ["/", "."];

/** Delimiter-aware prefix test: the same path, or a child of it behind a boundary character. */
function owns(prefix: string, path: string): boolean {
  return path === prefix || BOUNDARIES.some((boundary) => path.startsWith(prefix + boundary));
}

/**
 * Resolves a source path to the bounded context that owns it.
 *
 * INTENT: contexts declare their prefixes in the glossary file itself, so the domain map is
 * reviewed with the vocabulary it scopes rather than living in build configuration.
 *
 * @param model the glossary whose declared contexts drive resolution.
 * @param path source path of the declaring module — a directory path (`packages/billing/x.ts`), a
 * package name (`@acme/billing`), or a dotted module path (`acme.billing.Overdraft`).
 * @returns the owning context's name, or {@link UNASSIGNED_CONTEXT} when no declared prefix
 * matches. The longest matching prefix wins, so contexts may nest; ties between equally long
 * prefixes resolve to the first context name in order, so the result never depends on map order.
 * @throws {TypeError} if `path` is blank — a blank path is a caller bug, and reporting it as
 * unassigned would bury that bug in the harvest.
 * @remarks Matching is delimiter-aware: `packages/billing` owns `packages/billing/overdraft` but
 * never `packages/billingx`.
 * @example
 * ```ts
 * resolveContext(model, "packages/billing/overdraft-service.ts"); // "billing"
 * ```
 */
export function resolveContext(model: Glossary, path: string): string {
  requireNonBlank(path, "path");
  let best = UNASSIGNED_CONTEXT;
  let bestLength = -1;
  for (const [name, context] of byKey(model.contexts)) {
    for (const prefix of context.packages) {
      if (owns(prefix, path) && prefix.length > bestLength) {
        best = name;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

/**
 * Maps the class or module name on a trace node to the source path context resolution reads.
 *
 * INTENT: trace nodes carry only a bare class name, but contexts are declared as path prefixes, so
 * the caller supplies the missing half. The suite hook knows the real file layout; tests hand over
 * a lookup table.
 *
 * @param className the `className` of a captured signature.
 * @returns the declaring module's source path, or `undefined` when unknown — which files the
 * observation under `_unassigned` rather than failing the run.
 */
export type SourcePathLookup = (className: string) => string | undefined;

/**
 * Resolves the bounded context that owns a class, through the caller's source-path lookup.
 *
 * INTENT: the one place "which context is this class in?" is answered, shared by the harvester and
 * the translated view — the two must agree, or a term would be harvested into one context and
 * looked up in another, and every translation would silently miss.
 *
 * @param model the glossary whose declared contexts drive resolution.
 * @param sourcePathOf the caller's class-to-path lookup.
 * @param className the class name from a trace node.
 * @returns the owning context's name, or {@link UNASSIGNED_CONTEXT} when the lookup knows no path
 * for the class, yields a blank one, or the path matches no declared prefix.
 */
export function contextOfClass(
  model: Glossary,
  sourcePathOf: SourcePathLookup,
  className: string,
): string {
  const path = sourcePathOf(className);
  return path === undefined || path.trim() === ""
    ? UNASSIGNED_CONTEXT
    : resolveContext(model, path);
}
