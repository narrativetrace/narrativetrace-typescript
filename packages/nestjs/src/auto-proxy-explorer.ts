// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { type AutoProxyOptions, NARRATIVE_OPTIONS } from "./auto-proxy-options.js";
import { NarrativeStorage } from "./narrative-storage.js";
import { isNoAutoProxy } from "./no-auto-proxy.decorator.js";
import { wrapPrototypeMethods } from "./wrap-prototype.js";

const INTERNAL_NAMES = new Set(["NarrativeStorage", "NarrativeInterceptor", "AutoProxyExplorer"]);

@Injectable()
export class AutoProxyExplorer implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly storage: NarrativeStorage,
    @Inject(NARRATIVE_OPTIONS) private readonly options: AutoProxyOptions,
  ) {}

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
    if (this.options.exclude?.includes(metatype)) return;
    if (INTERNAL_NAMES.has(metatype.name)) return;
    try {
      wrapPrototypeMethods(metatype.prototype, metatype.name, this.storage);
    } catch {
      // that provider stays untraced; every other provider must still get wrapped
    }
  }
}
