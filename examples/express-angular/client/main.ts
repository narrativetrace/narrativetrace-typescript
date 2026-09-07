// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import "zone.js";
import "@angular/compiler";

import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app.component.js";
import { appConfig } from "./app.config.js";

bootstrapApplication(AppComponent, appConfig).catch(console.error);
