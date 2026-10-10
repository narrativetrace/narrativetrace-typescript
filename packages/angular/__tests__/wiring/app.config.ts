// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ApplicationConfig } from "@angular/core";
import { provideNarrativeTrace } from "@narrativetrace/angular";
import { renderIndentedText, type TraceTree } from "@narrativetrace/core";

/**
 * Add the provider to your application config, next to provideRouter. Register each service to
 * trace with provideTraced(OrderService), and every navigation prints its own trace.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideNarrativeTrace({
      captureOnNavigation: true,
      onTraceCapture(tree: TraceTree) {
        console.log(renderIndentedText(tree));
      },
    }),
  ],
};
