// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type DynamicModule, Module } from "@nestjs/common";
import { APP_INTERCEPTOR, DiscoveryModule } from "@nestjs/core";
import { AutoProxyExplorer } from "./auto-proxy-explorer.js";
import { type AutoProxyOptions, NARRATIVE_OPTIONS } from "./auto-proxy-options.js";
import { NarrativeInterceptor } from "./narrative-interceptor.js";
import { NarrativeStorage } from "./narrative-storage.js";

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS @Module() requires a class
export class AutoProxyModule {
  static forRoot(options: AutoProxyOptions = {}): DynamicModule {
    return {
      module: AutoProxyModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [
        { provide: NARRATIVE_OPTIONS, useValue: options },
        NarrativeStorage,
        AutoProxyExplorer,
        { provide: APP_INTERCEPTOR, useClass: NarrativeInterceptor },
      ],
      exports: [NarrativeStorage],
    };
  }
}
