// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export {
  createHonoNarrativeContext,
  DEFAULT_HONO_BUFFER_CAPACITY,
  type HonoContextOptions,
} from "./narrative-context.js";
export {
  extractRequestInfo,
  getNarrativeContext,
  type NarrativeTraceOptions,
  narrativeTrace,
  type RequestCompletion,
  type UserInfo,
  withConnInfoClientIp,
} from "./narrative-trace-middleware.js";
