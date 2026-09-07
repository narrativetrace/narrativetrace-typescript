// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { type TraceNode, type TreeWalkStop, walkPreOrder } from "@narrativetrace/core";
import { type Context, context, type Span, type Tracer, trace } from "@opentelemetry/api";
import {
  emitChildEvent,
  setConcurrencyAttributes,
  setNtSchemaAttributes,
  setOutcomeAttributes,
  setSpanAttributes,
  setTraceIdentityAttributes,
  setTraceLevelAttributes,
} from "./span-context-attribute-mapper.js";

/**
 * Exports completed {@link TraceNode} trees as OpenTelemetry spans after capture (batch counterpart
 * to the streaming `createOtelEventConsumer`). Parent-child structure is recreated by nesting span
 * scopes; span start/end anchor to each node's recorded timing and every span carries
 * `narrative.duration_ms`. Port of Java `TraceSpanExporter`.
 */
/** Per-run bookkeeping the explicit-stack walk threads node-to-node: each node's own span, and the
 * parent context its span was started under (absent for a root — it starts under the active
 * context instead). */
interface ExportState {
  readonly spanOf: Map<TraceNode, Span>;
  readonly parentCtxOf: Map<TraceNode, Context>;
}

export class TraceSpanExporter {
  constructor(private readonly tracer: Tracer) {}

  /**
   * Exports a forest of {@link TraceNode} trees as OpenTelemetry spans. Bounded and cycle-safe: a
   * hand-built, replayed or deserialized tree — cyclic or merely very deep — ends the affected
   * span with a `narrative.truncated` attribute instead of crashing or hanging.
   */
  export(roots: readonly TraceNode[]): void {
    const state: ExportState = { spanOf: new Map(), parentCtxOf: new Map() };
    walkPreOrder(
      roots,
      (n) => this.childrenOf(n, state),
      (node, stop) => this.enterNode(node, stop, state),
      (node) => this.endSpan(node, state),
    );
  }

  // The node's own span always starts ("contributes itself"); a stopped node's span ends
  // immediately here (walkPreOrder never calls endSpan for it) with a truncation marker instead of
  // spanning its descendants.
  private enterNode(node: TraceNode, stop: TreeWalkStop | undefined, state: ExportState): void {
    const { className, methodName } = node.signature;
    const parentCtx = state.parentCtxOf.get(node) ?? context.active();
    const span = this.tracer.startSpan(
      `${className}.${methodName}`,
      { startTime: node.startTimeMs },
      parentCtx,
    );
    this.decorate(span, node, !state.parentCtxOf.has(node));
    state.spanOf.set(node, span);
    if (stop !== undefined) {
      span.setAttribute("narrative.truncated", stop);
      this.endSpan(node, state);
    }
  }

  // Records each child's completion event on its parent's span and its parent context — the
  // moment the walk asks for a node's children, always before that child's own enterNode fires.
  private childrenOf(node: TraceNode, state: ExportState): readonly TraceNode[] {
    const span = state.spanOf.get(node) as Span;
    const childCtx = trace.setSpan(state.parentCtxOf.get(node) ?? context.active(), span);
    for (const child of node.children) {
      emitChildEvent(span, child);
      state.parentCtxOf.set(child, childCtx);
    }
    return node.children;
  }

  private endSpan(node: TraceNode, state: ExportState): void {
    state.spanOf.get(node)?.end(node.startTimeMs + node.durationMs);
  }

  private decorate(span: Span, node: TraceNode, isRoot: boolean): void {
    setSpanAttributes(node.signature, span);
    if (node.spanContext !== undefined) {
      setTraceIdentityAttributes(node.spanContext, span);
      setNtSchemaAttributes(node.spanContext, span);
    }
    span.setAttribute("narrative.duration_ms", node.durationMs);
    setOutcomeAttributes(node.outcome, span);
    setConcurrencyAttributes(node.concurrency, span);
    if (isRoot && node.spanContext !== undefined) {
      setTraceLevelAttributes(node.spanContext, span);
    }
  }
}
