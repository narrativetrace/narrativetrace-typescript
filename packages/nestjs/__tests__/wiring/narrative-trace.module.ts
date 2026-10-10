// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type NarrativeContext, renderIndentedText } from "@narrativetrace/core-node";
import { AutoProxyModule, type NestRequestCompletion } from "@narrativetrace/nestjs";

function onRequestComplete(_context: NarrativeContext, completion: NestRequestCompletion): void {
  console.log(renderIndentedText(completion.tree));
}

/**
 * Add it to your root module's imports, next to what is already there. Every provider is then
 * traced, and every request prints its own trace once the response is sent.
 */
export const NarrativeTraceModule = AutoProxyModule.forRoot({ onRequestComplete });
