// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// support/stable-ids.ts
import { registerIdGenerator, type SpanId, type TraceId } from "@narrativetrace/core-node";

/**
 * Makes span ids the same on every run, so a log line a recipe page embeds is byte-stable.
 *
 * A real run mints random ones — keep it that way in your project; this exists only because a
 * recipe page quotes the output of a run and a random id would differ every time. The trace id is
 * fixed separately, by adopting a `traceparent`, which is how a real inbound request fixes it.
 */
export function useStableSpanIds(): void {
  let next = 0;
  registerIdGenerator({
    traceId: () => "c4e1d0a7c4e1d0a7c4e1d0a7c4e1d0a7" as TraceId,
    spanId: () => `${(++next).toString(16).padStart(16, "0")}` as SpanId,
  });
}

/**
 * Like {@link useStableSpanIds}, but a trace the run starts for itself gets a NEW, numbered id
 * instead of the fixed one — so a test can tell a trace that was adopted (the fixed id) from one
 * that was started fresh (`…0001`, `…0002`).
 *
 * INTENT: a page about work that lost its trace needs the fresh id to differ from the adopted one;
 * with a fixed generator every fresh trace would look adopted. Never do this in your own project.
 */
export function useNumberedTraceIds(): void {
  let spans = 0;
  let traces = 0;
  registerIdGenerator({
    traceId: () => `${(++traces).toString(16).padStart(32, "0")}` as TraceId,
    spanId: () => `${(++spans).toString(16).padStart(16, "0")}` as SpanId,
  });
}
