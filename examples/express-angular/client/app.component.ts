// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Component } from "@angular/core";
import { OrderFormComponent } from "./order-form.component.js";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [OrderFormComponent],
  template: `<app-order-form />`,
})
export class AppComponent {}
