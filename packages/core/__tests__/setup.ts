// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { registerIdGenerator } from "../src/id-generator.js";
import type { SpanId, TraceId } from "../src/span-id-generator.js";

let traceCounter = 0;
let spanCounter = 0;

registerIdGenerator({
  traceId: () => (++traceCounter).toString(16).padStart(32, "0") as TraceId,
  spanId: () => (++spanCounter).toString(16).padStart(16, "0") as SpanId,
});
