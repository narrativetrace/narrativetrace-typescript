// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext } from "./narrative-context.js";
import type { SpanId, TraceId } from "./span-id-generator.js";
import type { TraceTree } from "./trace-tree.js";
import { traceTree } from "./trace-tree.js";

const EMPTY_TREE = traceTree([]);
const NOOP_SPAN_ID = "" as SpanId;
const NOOP_TRACE_ID = "00000000000000000000000000000000" as TraceId;

/**
 * A frozen, do-nothing {@link NarrativeContext} used when tracing is off or unavailable.
 *
 * INTENT: the null-object that lets call sites stay unconditional — every hook is a cheap no-op,
 * `captureTrace()` returns the empty tree, and `traceId()` yields the all-zero id. Reach for this
 * instead of `null` so callers never branch on the absence of a context.
 *
 * @remarks Fail-safe posture: guarantees observability can never influence application behaviour;
 * `isActive` and `capturesParameterValues` are permanently `false`.
 */
export const NOOP_CONTEXT: NarrativeContext = Object.freeze({
  enterMethod(): SpanId {
    return NOOP_SPAN_ID;
  },
  exitMethodWithReturn(): void {},
  exitMethodWithException(): void {},
  detachFrame(): void {},
  captureTrace(): TraceTree {
    return EMPTY_TREE;
  },
  reset(): void {},
  parentOf(): SpanId | null {
    return null;
  },
  run<T>(fn: () => T): T {
    return fn();
  },
  runScoped<T>(_handle: SpanId, fn: () => T): T {
    return fn();
  },
  traceId(): TraceId {
    return NOOP_TRACE_ID;
  },
  setRequestContext(): void {},
  setUserContext(): void {},
  isActive: false,
  capturesParameterValues: false,
  storyId: null,
  chapterId: null,
});
