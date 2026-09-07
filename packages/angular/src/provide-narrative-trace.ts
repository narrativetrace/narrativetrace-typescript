// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import {
  ENVIRONMENT_INITIALIZER,
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  type Provider,
} from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import {
  type NarrativeContext,
  NarrativeTraceConfig,
  SyncNarrativeContext,
  type TraceTree,
} from "@narrativetrace/core";
import { filter } from "rxjs";
import { NARRATIVE_CONTEXT } from "./tokens.js";
import { traceInterceptor } from "./trace-interceptor.js";

export interface NarrativeTraceOptions {
  captureOnNavigation?: boolean;
  onTraceCapture?: (trace: TraceTree) => void;
}

function startNavigationCapture(
  router: Router,
  ctx: NarrativeContext,
  onCapture: (trace: TraceTree) => void,
): void {
  router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
    const trace = ctx.captureTrace();
    if (trace.roots.length > 0) onCapture(trace);
    ctx.reset();
  });
}

function navigationInitializer(onCapture: (trace: TraceTree) => void): Provider {
  return {
    provide: ENVIRONMENT_INITIALIZER,
    multi: true,
    useFactory: () => {
      const router = inject(Router);
      const ctx = inject(NARRATIVE_CONTEXT);
      return () => startNavigationCapture(router, ctx, onCapture);
    },
  };
}

export function provideNarrativeTrace(options?: NarrativeTraceOptions): EnvironmentProviders {
  const providers: (Provider | EnvironmentProviders)[] = [
    {
      provide: NARRATIVE_CONTEXT,
      useFactory: () => new SyncNarrativeContext(new NarrativeTraceConfig("detail")),
    },
    provideHttpClient(withInterceptors([traceInterceptor])),
  ];
  if (options?.captureOnNavigation && options.onTraceCapture) {
    providers.push(navigationInitializer(options.onTraceCapture));
  }
  return makeEnvironmentProviders(providers);
}
