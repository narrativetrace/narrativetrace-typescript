// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { InjectionToken } from "@angular/core";
import type { NarrativeContext } from "@narrativetrace/core";

export const NARRATIVE_CONTEXT = new InjectionToken<NarrativeContext>(
  "@narrativetrace/angular:context",
);
