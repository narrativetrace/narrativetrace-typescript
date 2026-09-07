// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ApplicationConfig } from "@angular/core";
import { provideNarrativeTrace, provideTraced } from "@narrativetrace/angular";
import { OrderService } from "./order.service.js";

export const appConfig: ApplicationConfig = {
  providers: [provideNarrativeTrace(), provideTraced(OrderService)],
};
