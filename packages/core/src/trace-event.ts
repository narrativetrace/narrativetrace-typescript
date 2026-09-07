// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { ConcurrencyInfo } from "./concurrency-info.js";
import type { MethodSignature } from "./method-signature.js";
import type { SpanContext } from "./span-context.js";
import type { TraceOutcome } from "./trace-outcome.js";

/**
 * Emitted when a traced method is entered, carrying its {@link SpanContext} and call
 * {@link MethodSignature}.
 *
 * INTENT: the streaming counterpart to a {@link TraceNode} — where the tree is the assembled shape,
 * events are the flat, ordered log that exporters (e.g. canonical log lines) consume as they happen.
 */
export interface EnterEvent {
  readonly type: "enter";
  readonly spanContext: SpanContext;
  readonly timestamp: number;
  readonly signature: MethodSignature;
  /**
   * Present only on the first span opened under an activated context snapshot, tagging it as
   * `async`.
   *
   * @remarks Capture's own tag, unlike a fork group's, which the group publishes separately once it
   * knows its members. It has to be decided here because only the capturing context knows it has
   * just crossed an asynchronous boundary.
   */
  readonly concurrency?: ConcurrencyInfo;
}

/**
 * Emitted when a traced method leaves, pairing its {@link SpanContext} with the terminal
 * {@link TraceOutcome} (returned / threw / incomplete). Matches an earlier {@link EnterEvent} by span.
 */
export interface ExitEvent {
  readonly type: "exit";
  readonly spanContext: SpanContext;
  readonly timestamp: number;
  readonly outcome: TraceOutcome;
}

/**
 * Emitted when a concurrent work group is spawned.
 *
 * INTENT: marks the boundary where child spans branch off a parent. `strategy` distinguishes
 * `fork-join` (parent awaits the members) from `fire-and-forget` (parent does not); `rootSpanId`
 * anchors the group's members and `parentSpanId` links back to the spawning call.
 */
export interface ForkCreatedEvent {
  readonly type: "fork-created";
  readonly groupId: string;
  readonly parentSpanId: string;
  readonly rootSpanId: string;
  readonly strategy: "fork-join" | "fire-and-forget";
  readonly timestamp: number;
}

/**
 * Emitted when a fork group finishes, closing the {@link ForkCreatedEvent} with the same `groupId`.
 *
 * @remarks `wallTimeMs` is the group's elapsed wall time (not summed member time); `memberCount`
 * is how many tasks joined.
 */
export interface JoinCompleteEvent {
  readonly type: "join-complete";
  readonly groupId: string;
  readonly memberCount: number;
  readonly wallTimeMs: number;
  readonly timestamp: number;
}

/**
 * The ordered event stream produced during capture, discriminated by `type`.
 *
 * INTENT: the wire/log form of a trace. Consumers (e.g. {@link toCanonicalEntry}) switch on `type`
 * to project each event; enter/exit describe individual calls, fork/join describe concurrency edges.
 */
export type TraceEvent = EnterEvent | ExitEvent | ForkCreatedEvent | JoinCompleteEvent;
