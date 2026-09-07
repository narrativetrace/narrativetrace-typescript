// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { generateTraceId, type TraceId } from "./span-id-generator.js";
import { firstSpanContext, type TraceNode } from "./trace-node.js";

/**
 * The root of a captured trace: the top-level calls of one narrative session.
 *
 * INTENT: the handoff object between the capture phase and any renderer/exporter. `roots` are the
 * entry-point calls (each a {@link TraceNode} subtree); `isEmpty` is a precomputed convenience so
 * consumers can skip rendering nothing without inspecting `roots.length`.
 *
 * `traceId` is the trace this capture belongs to, resolved **once, here** rather than per exporter:
 * two exporters reading one tree must be unable to name two different traces. It is absent only on
 * an empty tree — nothing ran, so there is nothing to identify.
 */
export interface TraceTree {
  readonly roots: readonly TraceNode[];
  readonly isEmpty: boolean;
  readonly traceId?: TraceId;
}

/**
 * The id a tree that was handed none must carry: inherited from the first span context anywhere in
 * it, and only otherwise generated.
 *
 * @remarks Generation is eager and yields a real, unique W3C-shaped id. The retired alternative — a
 * fixed synthetic constant — made two unrelated captures indistinguishable, which is precisely the
 * job `trace_id` exists to do; byte-comparison of unique fields belongs in the conformance
 * normalizer, not the emitter (owner decision 2026-08-30, product ADR-014).
 */
function assignedTraceId(roots: readonly TraceNode[]): TraceId {
  return firstSpanContext(roots)?.traceId ?? generateTraceId();
}

/**
 * Builds a frozen {@link TraceTree} from a set of root calls, defensively copying the array.
 *
 * @param roots the top-level captured calls; an empty array yields a tree with `isEmpty === true`.
 * @param traceId the id the capturing context already assigned. Pass it whenever the tree is built
 * from captured events: the context owns the identity, and re-deriving it here would let one run
 * report two. Omit it for a hand-built tree, which then inherits or generates one — once.
 * @returns a tree carrying a resolved `traceId` unless it is empty, in which case it carries none.
 * @throws {Error} if an id has to be generated while no `IdGenerator` is registered and the runtime
 * has no Web Crypto — the same contract {@link generateTraceId} has always had.
 */
export function traceTree(roots: readonly TraceNode[], traceId?: TraceId): TraceTree {
  const frozenRoots = Object.freeze([...roots]);
  return Object.freeze({
    roots: frozenRoots,
    isEmpty: frozenRoots.length === 0,
    ...(frozenRoots.length > 0 && { traceId: traceId ?? assignedTraceId(frozenRoots) }),
  });
}
