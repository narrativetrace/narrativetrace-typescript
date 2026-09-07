// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InjectionToken, inject, type Provider, type Type } from "@angular/core";
import { traceObject } from "@narrativetrace/proxy";
import { NARRATIVE_CONTEXT } from "./tokens.js";

export function provideTraced<T extends object>(serviceClass: Type<T>): Provider[] {
  const RAW = new InjectionToken<T>(`${serviceClass.name}_raw`);
  return [
    { provide: RAW, useClass: serviceClass },
    {
      provide: serviceClass,
      useFactory: () => {
        const instance = inject(RAW);
        const ctx = inject(NARRATIVE_CONTEXT);
        return traceObject(instance, ctx, undefined, { className: serviceClass.name });
      },
    },
  ];
}
