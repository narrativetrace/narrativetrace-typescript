// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  humanName,
  TREE_WALK_MARKER,
  type TraceId,
  type TraceNode,
  type TraceTree,
  type TreeWalkStop,
  walkPreOrder,
} from "@narrativetrace/core-web";

function formatCall(node: TraceNode): string {
  const { className, methodName, parameters } = node.signature;
  const params = parameters.map((p) => `${p.name}: ${p.renderedValue}`).join(", ");
  return `${className}.${methodName}(${params})`;
}

function formatOutcome(node: TraceNode): string {
  if (node.outcome.kind === "threw") {
    const err = node.outcome.error;
    const msg = err instanceof Error ? err.message : String(err);
    return ` \u2717 ${msg}`;
  }
  if (node.outcome.kind === "incomplete") return " \u23F3 (incomplete)";
  const ret = node.outcome.renderedValue;
  if (ret !== null && ret !== "undefined") {
    return ` \u2192 ${ret}`;
  }
  return "";
}

function logNarration(node: TraceNode): void {
  if (node.signature.narration !== undefined) {
    console.log(`  ${node.signature.narration}`);
  }
}

// The node's own line prints regardless of the guard ("contributes itself"); a stopped node opens
// and closes its own group inline (walkPreOrder never calls exitNode for it) instead of leaving an
// unmatched console.group() open.
function enterNode(node: TraceNode, stop: TreeWalkStop | undefined): void {
  const label = `${formatCall(node)}${formatOutcome(node)}`;
  if (stop !== undefined) {
    console.group(label);
    logNarration(node);
    console.log(TREE_WALK_MARKER[stop]);
    console.groupEnd();
    return;
  }
  if (node.children.length === 0) {
    console.log(label);
    logNarration(node);
    return;
  }
  console.group(label);
  logNarration(node);
}

// Only a node whose group is still open (it had children and was not stopped) needs closing —
// walkPreOrder calls this exactly once per such node, after all its descendants are visited.
function exitNode(node: TraceNode): void {
  if (node.children.length > 0) console.groupEnd();
}

/**
 * Logs a trace to the browser/Node console via `console.group`/`console.groupEnd`, one collapsible
 * group per call with children, a plain `console.log` line for a leaf. Bounded and cycle-safe: a
 * hand-built, replayed or deserialized tree — cyclic or merely very deep — logs a
 * "… (depth limit)"/"… (cycle)" marker line instead of crashing or hanging.
 */
export function renderToConsole(tree: TraceTree): void {
  const traceId = tree.roots[0]?.spanContext?.traceId;
  if (traceId) {
    console.log(`[${humanName(traceId as TraceId)}]`);
  }
  walkPreOrder(tree.roots, (n) => n.children, enterNode, exitNode);
}
