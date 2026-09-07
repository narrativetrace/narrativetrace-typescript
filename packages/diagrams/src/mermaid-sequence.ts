// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  errorTypeName,
  TREE_WALK_MARKER,
  type TraceNode,
  type TraceTree,
  type TreeWalkStop,
  walkPreOrder,
} from "@narrativetrace/core";
import { generateAlias } from "./alias-generator.js";
import { DiagramText } from "./diagram-text.js";

// The alias is derived from the sanitized name, not the raw one — an alias token is emitted
// unquoted on every arrow line, so a hostile character reaching it is a worse injection than one
// confined to the (quotable) participant display name (cross-port shape F4, 2026-09-02 audit).
// Bounded and cycle-safe (walkPreOrder) — a hand-built or deserialized tree can hold an ancestor.
function collectParticipants(nodes: readonly TraceNode[], aliases: Map<string, string>): void {
  walkPreOrder(
    nodes,
    (n) => n.children,
    (node) => {
      const name = node.signature.className;
      if (!aliases.has(name)) {
        aliases.set(name, generateAlias(DiagramText.identifier(name), aliases));
      }
    },
  );
}

// Java quoteIfNeeded: wrap a display name containing space, ".", "-", ":", "<" or ">" so it
// cannot break the diagram grammar. Arrows use the safe 2-char alias, so only the participant
// display needs it.
function quoteIfNeeded(name: string): string {
  return /[ .:<>-]/.test(name) ? `"${name}"` : name;
}

function declareParticipants(aliases: Map<string, string>): string[] {
  return [...aliases].map(
    ([className, alias]) =>
      `  participant ${alias} as ${quoteIfNeeded(DiagramText.identifier(className))}`,
  );
}

type Response =
  | { kind: "returned"; label: string }
  | { kind: "threw"; label: string }
  | { kind: "incomplete" };

function formatResponse(node: TraceNode): Response | null {
  if (node.outcome.kind === "threw") {
    return { kind: "threw", label: DiagramText.message(errorTypeName(node.outcome.error)) };
  }
  if (node.outcome.kind === "incomplete") return { kind: "incomplete" };
  const ret = node.outcome.renderedValue;
  if (ret === null || ret === "undefined") return null;
  return { kind: "returned", label: DiagramText.message(ret) };
}

// Root nodes self-return (callerAlias === alias) so the entry point shows a real return arrow
// rather than a note (Java seeds the root caller as itself). Incomplete uses a lifeline note.
function pushResponse(response: Response, alias: string, callerAlias: string, lines: string[]) {
  if (response.kind === "incomplete") {
    lines.push(`  Note over ${alias}: in-flight`);
    return;
  }
  const arrow = response.kind === "threw" ? "-x" : "-->>";
  lines.push(`  ${alias}${arrow}${callerAlias}: ${response.label}`);
}

function formatCall(node: TraceNode, callerAlias: string, alias: string): string {
  const params = node.signature.parameters
    .map((p) => DiagramText.message(`${p.name}: ${p.renderedValue}`))
    .join(", ");
  const methodName = DiagramText.message(node.signature.methodName);
  return `  ${callerAlias}->>${alias}: ${methodName}(${params})`;
}

function pushResponseIfAny(
  node: TraceNode,
  alias: string,
  callerAlias: string,
  lines: string[],
): void {
  const response = formatResponse(node);
  if (response !== null) pushResponse(response, alias, callerAlias, lines);
}

// The node's own call arrow prints regardless of the guard ("contributes itself"); a stopped node
// shows a marker note and its response inline (walkPreOrder never calls exitNode for it) instead
// of descending.
function enterNode(
  node: TraceNode,
  stop: TreeWalkStop | undefined,
  aliases: Map<string, string>,
  callerAliasOf: Map<TraceNode, string>,
  lines: string[],
): void {
  const alias = aliases.get(node.signature.className) as string;
  const callerAlias = callerAliasOf.get(node) ?? alias;
  lines.push(formatCall(node, callerAlias, alias));
  if (stop === undefined) return;
  lines.push(`  Note over ${alias}: ${TREE_WALK_MARKER[stop]}`);
  pushResponseIfAny(node, alias, callerAlias, lines);
}

// Only a node the walk fully descended into needs its response pushed here — a stopped node's
// response was already pushed inline by enterNode.
function exitNode(
  node: TraceNode,
  aliases: Map<string, string>,
  callerAliasOf: Map<TraceNode, string>,
  lines: string[],
): void {
  const alias = aliases.get(node.signature.className) as string;
  const callerAlias = callerAliasOf.get(node) ?? alias;
  pushResponseIfAny(node, alias, callerAlias, lines);
}

// Records each node's caller alias (its parent's own alias, or itself for a root) the moment the
// walk asks for its children — always before that child's own enterNode fires.
function childrenOf(
  node: TraceNode,
  aliases: Map<string, string>,
  callerAliasOf: Map<TraceNode, string>,
): readonly TraceNode[] {
  const alias = aliases.get(node.signature.className) as string;
  for (const child of node.children) callerAliasOf.set(child, alias);
  return node.children;
}

// Explicit-stack (non-recursive) pre-order walk, bounded and cycle-safe via TreeWalk — see
// markdown-renderer.ts's renderTree (in @narrativetrace/core) for the full rationale.
function renderInteractions(roots: readonly TraceNode[], aliases: Map<string, string>): string[] {
  const lines: string[] = [];
  const callerAliasOf = new Map<TraceNode, string>();
  walkPreOrder(
    roots,
    (n) => childrenOf(n, aliases, callerAliasOf),
    (node, stop) => enterNode(node, stop, aliases, callerAliasOf, lines),
    (node) => exitNode(node, aliases, callerAliasOf, lines),
  );
  return lines;
}

export function renderMermaidSequence(tree: TraceTree): string {
  const aliases = new Map<string, string>();
  collectParticipants(tree.roots, aliases);

  return [
    "sequenceDiagram",
    ...declareParticipants(aliases),
    ...renderInteractions(tree.roots, aliases),
  ].join("\n");
}
