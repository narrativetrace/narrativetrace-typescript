// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanContext } from "./span-context.js";
import { generateTraceId, type TraceId } from "./span-id-generator.js";
import { humanName } from "./trace-namer.js";
import { firstSpanContext, type TraceNode } from "./trace-node.js";
import type { TraceTree } from "./trace-tree.js";

/**
 * The identity every record derived from one tree shares: trace, story, chapter and the human name
 * that must agree with the trace id.
 *
 * INTENT: one resolution, read by every exporter. `inherited` is exposed because the same context
 * that supplies the identity also supplies the service/environment a context-free root cannot.
 */
export interface TraceIdentity {
  /** The first real span context anywhere in the tree, or `undefined` for a context-free capture. */
  readonly inherited: SpanContext | undefined;
  readonly traceId: TraceId;
  /** `humanName(traceId)` — never derived from anything else, so the two can never disagree. */
  readonly traceName: string;
  readonly storyId: string;
  readonly chapterId: string;
}

/**
 * `Class.method` of the first root call — the story a capture that inherited none derives.
 *
 * @remarks Also the chapter title's derivation, deliberately shared: title and story are different
 * fields, but on a context-free capture they answer the same question and must not diverge. An
 * empty forest has no root call at all and yields the same `"undefined.undefined"` the title has
 * always used there.
 */
export function rootCallName(roots: readonly TraceNode[]): string {
  const signature = roots[0]?.signature;
  return `${signature?.className}.${signature?.methodName}`;
}

/**
 * Resolves the identity of one captured tree: **adopt → inherit → generate**.
 *
 * INTENT: identity is generated *eagerly and always*, so no artifact ever ships an empty or
 * synthetic `trace_id`. Resolution lives here rather than in each exporter because two exporters
 * reading one tree must be unable to name two different traces — the defect Java found when it left
 * generation to the exporters (owner decision 2026-08-30, product ADR-014).
 *
 * - `traceId` — the id the tree carries (assigned by its capturing context, or resolved once at
 *   construction), else the first span context found anywhere in the tree depth-first, else a fresh
 *   real id. Only an empty tree reaches the generate rung here: nothing ran, so it carried none.
 * - `storyId` — inherited when the span context names one, else {@link rootCallName}. Never
 *   generated, and never the chapter title standing in for identity.
 * - `chapterId` — inherited when present, else equal to `storyId`.
 *
 * @param tree the captured trace.
 * @returns identity fields that are all non-empty and schema-shaped, for any tree.
 */
export function resolveTraceIdentity(tree: TraceTree): TraceIdentity {
  const inherited = firstSpanContext(tree.roots);
  const traceId = tree.traceId ?? inherited?.traceId ?? generateTraceId();
  const storyId = inherited?.storyId ?? rootCallName(tree.roots);
  return {
    inherited,
    traceId,
    traceName: humanName(traceId),
    storyId,
    chapterId: inherited?.chapterId ?? storyId,
  };
}
