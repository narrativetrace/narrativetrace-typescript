// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { StructuralSkipReason } from "./instrumentation-exclusions.js";

/** One member of the shipped default (list 2): the prefix, why it is there, and what it rests on. */
export interface ShippedExclusion {
  readonly prefix: string;
  readonly reason: string;
  readonly source: string;
}

const NEST = "https://github.com/nestjs/nest/blob/master/packages/core";

/**
 * List 2 with its reasons: the members of `DEFAULT_EXCLUDE`, each with why it is there and the
 * source it rests on. Verified by bootstrapping a NestJS 11 application with the auto-proxy and
 * listing the discovered providers. The configuration guide publishes this table verbatim.
 */
export const SHIPPED_EXCLUDE: readonly ShippedExclusion[] = [
  {
    prefix: "ModuleRef",
    reason: "NestJS dependency-injection container's own resolver, a provider in every module",
    source: `${NEST}/injector/module-ref.ts`,
  },
  {
    prefix: "Reflector",
    reason:
      "NestJS metadata reader that guards and interceptors call; plumbing, not a business step",
    source: `${NEST}/services/reflector.service.ts`,
  },
  {
    prefix: "MetadataScanner",
    reason: "NestJS bootstrap-time scanner of class metadata, runs while the application starts",
    source: `${NEST}/metadata-scanner.ts`,
  },
  {
    prefix: "DiscoveryService",
    reason: "NestJS provider-discovery service the auto-proxy itself is built on",
    source: `${NEST}/discovery/discovery-service.ts`,
  },
];

/**
 * List 1 as published: one row per {@link StructuralSkipReason}. The configuration guide quotes
 * these strings verbatim and a root test holds it to them.
 */
export const STRUCTURAL_SKIPS: Readonly<Record<StructuralSkipReason, string>> = {
  "protocol-hook":
    "`toString`, `valueOf`, `toJSON`, `then`, every well-known symbol (`Symbol.iterator`, …) and Node's inspect hook: the runtime calls these on its own behalf",
  "class-constructor":
    "a `class` held as a property or on a prototype: a wrapper cannot be `new`ed, so it is left as-is and reported once",
  "bound-wrapper":
    "a `bind()` copy of a function that is not one of the object's own methods (`log: console.log.bind(console)`); a bound copy that shadows an inherited method stays traced",
};
