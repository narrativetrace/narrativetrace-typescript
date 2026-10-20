// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { effectiveExclude, excludedPrefixOf, parseExclude } from "@narrativetrace/core";
import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { type AutoProxyOptions, NARRATIVE_OPTIONS } from "./auto-proxy-options.js";
import { NarrativeStorage } from "./narrative-storage.js";
import { isNoAutoProxy } from "./no-auto-proxy.decorator.js";
import { wrapPrototypeMethods } from "./wrap-prototype.js";

const INTERNAL_NAMES = new Set(["NarrativeStorage", "NarrativeInterceptor", "AutoProxyExplorer"]);

@Injectable()
export class AutoProxyExplorer implements OnApplicationBootstrap {
  // biome-ignore lint/complexity/noBannedTypes: NestJS metatypes are Function references
  private readonly excludedClasses: ReadonlySet<Function>;
  private readonly excludedNames: readonly string[];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly storage: NarrativeStorage,
    @Inject(NARRATIVE_OPTIONS) options: AutoProxyOptions,
  ) {
    // Validated here, before any provider is touched: a bad prefix fails the module build.
    const stated = options.exclude;
    this.excludedClasses = new Set(stated?.filter((entry) => typeof entry === "function"));
    const names = stated?.filter((entry) => typeof entry === "string");
    this.excludedNames = effectiveExclude(names && parseExclude(names));
  }

  onApplicationBootstrap() {
    const wrappers = [...this.discovery.getProviders(), ...this.discovery.getControllers()];
    for (const wrapper of wrappers) {
      this.tryWrap(wrapper);
    }
  }

  // Best-effort by construction: a class this runtime cannot wrap (a frozen prototype, an unusual
  // shape) must degrade to that one provider running untraced, never fail the whole bootstrap —
  // no-poison contract, this runtime's mirror of Java's optional-listener-discovery finding.
  private tryWrap(wrapper: { metatype?: unknown }): void {
    const metatype = wrapper.metatype as (Function & { prototype?: object }) | undefined;
    if (!metatype?.prototype) return;
    if (metatype.prototype === Object.prototype) return;
    if (isNoAutoProxy(metatype)) return;
    if (this.excludedClasses.has(metatype)) return;
    if (INTERNAL_NAMES.has(metatype.name)) return;
    if (excludedPrefixOf(metatype.name, this.excludedNames) !== undefined) return;
    try {
      wrapPrototypeMethods(metatype.prototype, metatype.name, this.storage);
    } catch {
      // that provider stays untraced; every other provider must still get wrapped
    }
  }
}
