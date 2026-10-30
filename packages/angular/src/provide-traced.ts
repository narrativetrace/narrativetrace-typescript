// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InjectionToken, inject, type Provider, type Type } from "@angular/core";
import { traceObject } from "@narrativetrace/proxy";
import { bindToOpenSpan } from "./request-origin.js";
import { NARRATIVE_CONTEXT } from "./tokens.js";

/**
 * Providers that make `serviceClass` injectable as a traced proxy: every method call on it becomes
 * a span on the app's `NARRATIVE_CONTEXT`.
 *
 * INTENT: the Angular wiring of `traceObject`, keeping the class's own constructor injection.
 *
 * @llmNote A method that returns a plain rxjs `Observable` (what `HttpClient` returns, piped or
 * not) gets back an equivalent Observable that remembers the method's span: the request it sends
 * on `subscribe()` — after the span has closed — carries a `traceparent` naming that span, on every
 * subscription. Subjects and other Observable subclasses come back as the same instance, unwrapped.
 * No span is held open for this: the method's span still closes when it returns.
 */
export function provideTraced<T extends object>(serviceClass: Type<T>): Provider[] {
  const RAW = new InjectionToken<T>(`${serviceClass.name}_raw`);
  return [
    { provide: RAW, useClass: serviceClass },
    {
      provide: serviceClass,
      useFactory: () => {
        const instance = inject(RAW);
        const ctx = inject(NARRATIVE_CONTEXT);
        return traceObject(instance, ctx, undefined, {
          className: serviceClass.name,
          wrapResult: bindToOpenSpan(ctx),
        });
      },
    },
  ];
}
