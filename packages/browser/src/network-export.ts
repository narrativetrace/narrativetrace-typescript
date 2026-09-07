// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { exportJson, type TraceMetadata, type TraceTree } from "@narrativetrace/core-web";

export async function postToCollector(
  tree: TraceTree,
  metadata: TraceMetadata,
  collectorUrl: string,
): Promise<Response> {
  const body = exportJson(tree, metadata);
  return fetch(collectorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
