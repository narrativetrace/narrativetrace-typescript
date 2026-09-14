// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  errorTypeName,
  type TraceNode,
  type TreeWalkStop,
  walkPreOrder,
} from "@narrativetrace/core";
import { generateAlias } from "./alias-generator.js";
import { DiagramLabel } from "./diagram-label.js";
import type { SequenceGrammar } from "./sequence-grammar.js";

/**
 * The one traversal both sequence-diagram renderers share: bounded, cycle-safe (via
 * `walkPreOrder`), emitting exactly one call arrow on the way into a node and exactly one outcome
 * (return, throw, or in-flight note) on the way out. Port of the Java reference's `SequenceWalk`
 * plus `SequenceParticipants` — this port always renders in alias mode for both formats (a
 * pre-existing divergence from Java, which has a plain and an alias mode for Mermaid only and no
 * alias mode for PlantUML at all), so participant collection and alias assignment are one function
 * here rather than two.
 *
 * @remarks A node beyond `walkPreOrder`'s depth limit or already on the current path (a cycle)
 * still gets its own call arrow and outcome, rendered exactly like a leaf, plus
 * `grammar.limitedNote(...)` — the walk simply never descends into its children. Every hook this
 * module calls takes a {@link DiagramLabel}, never the node's raw `className`/`methodName` string
 * — see that type's own module doc.
 */

// The alias is derived from the sanitized name, not the raw one — an alias token is emitted
// unquoted on every arrow line, so a hostile character reaching it is a worse injection than one
// confined to the (quotable) participant display name (cross-runtime shape F4, 2026-09-02 audit).
// Bounded and cycle-safe (walkPreOrder) — a hand-built or deserialized tree can hold an ancestor.
export function collectParticipants(nodes: readonly TraceNode[]): Map<string, DiagramLabel> {
  const rawAliases = new Map<string, string>();
  walkPreOrder(
    nodes,
    (n) => n.children,
    (node) => {
      const name = node.signature.className;
      if (!rawAliases.has(name)) {
        rawAliases.set(name, generateAlias(DiagramLabel.identifier(name), rawAliases));
      }
    },
  );
  const aliases = new Map<string, DiagramLabel>();
  for (const [name, generated] of rawAliases) aliases.set(name, DiagramLabel.alias(generated));
  return aliases;
}

// Order is each grammar's own call, via `grammar.participant` — Mermaid's `participant <id> as
// <label>` puts the alias first; PlantUML's `participant "<label>" as <alias>` puts the display
// name first (plantuml.com/sequence-diagram). Quoting-if-needed happens here, once, shared by
// both formats; only the ORDER the two already-built tokens print in is per-grammar.
export function declareParticipants(
  aliases: Map<string, DiagramLabel>,
  grammar: SequenceGrammar,
): string[] {
  return [...aliases].map(([className, alias]) =>
    grammar.participant(alias, DiagramLabel.quoted(DiagramLabel.identifier(className))),
  );
}

type Response =
  | { kind: "returned"; label: DiagramLabel }
  | { kind: "threw"; label: DiagramLabel }
  | { kind: "incomplete" };

function formatResponse(node: TraceNode): Response | null {
  if (node.outcome.kind === "threw") {
    return { kind: "threw", label: DiagramLabel.message(errorTypeName(node.outcome.error)) };
  }
  if (node.outcome.kind === "incomplete") return { kind: "incomplete" };
  const ret = node.outcome.renderedValue;
  if (ret === null || ret === "undefined") return null;
  return { kind: "returned", label: DiagramLabel.message(ret) };
}

function formatCall(node: TraceNode): DiagramLabel {
  const params = node.signature.parameters.map((p) =>
    DiagramLabel.message(`${p.name}: ${p.renderedValue}`),
  );
  const methodName = DiagramLabel.message(node.signature.methodName);
  return DiagramLabel.withParameters(methodName, params);
}

// Root nodes self-return (callerAlias === alias) so the entry point shows a real return arrow
// rather than a note (Java seeds the root caller as itself).
function pushResponse(
  response: Response,
  alias: DiagramLabel,
  callerAlias: DiagramLabel,
  grammar: SequenceGrammar,
  lines: string[],
): void {
  if (response.kind === "incomplete") {
    lines.push(grammar.incomplete(alias));
  } else if (response.kind === "threw") {
    lines.push(grammar.throwArrow(alias, callerAlias, response.label));
  } else {
    lines.push(grammar.returnArrow(alias, callerAlias, response.label));
  }
}

function pushResponseIfAny(
  node: TraceNode,
  alias: DiagramLabel,
  callerAlias: DiagramLabel,
  grammar: SequenceGrammar,
  lines: string[],
): void {
  const response = formatResponse(node);
  if (response !== null) pushResponse(response, alias, callerAlias, grammar, lines);
}

// The node's own call arrow (and, for a format with activation bars, `activate`) always print
// ("contributes itself"); a stopped node shows a marker note, its response, and (where the grammar
// has one) `deactivate` inline — walkPreOrder never calls exitNode for it — instead of descending.
function enterNode(
  node: TraceNode,
  stop: TreeWalkStop | undefined,
  aliases: Map<string, DiagramLabel>,
  callerAliasOf: Map<TraceNode, DiagramLabel>,
  grammar: SequenceGrammar,
  lines: string[],
): void {
  const alias = aliases.get(node.signature.className) as DiagramLabel;
  const callerAlias = callerAliasOf.get(node) ?? alias;
  lines.push(grammar.callArrow(callerAlias, alias, formatCall(node)));
  if (grammar.activate) lines.push(grammar.activate(alias));
  if (stop === undefined) return;
  lines.push(grammar.limitedNote(alias, stop));
  pushResponseIfAny(node, alias, callerAlias, grammar, lines);
  if (grammar.deactivate) lines.push(grammar.deactivate(alias));
}

// Only a node the walk fully descended into needs its response/deactivate pushed here — a
// stopped node's response and deactivate were already pushed inline by enterNode.
function exitNode(
  node: TraceNode,
  aliases: Map<string, DiagramLabel>,
  callerAliasOf: Map<TraceNode, DiagramLabel>,
  grammar: SequenceGrammar,
  lines: string[],
): void {
  const alias = aliases.get(node.signature.className) as DiagramLabel;
  const callerAlias = callerAliasOf.get(node) ?? alias;
  pushResponseIfAny(node, alias, callerAlias, grammar, lines);
  if (grammar.deactivate) lines.push(grammar.deactivate(alias));
}

// Records each node's caller alias (its parent's own alias, or itself for a root) the moment the
// walk asks for its children — always before that child's own enterNode fires.
function childrenOf(
  node: TraceNode,
  aliases: Map<string, DiagramLabel>,
  callerAliasOf: Map<TraceNode, DiagramLabel>,
): readonly TraceNode[] {
  const alias = aliases.get(node.signature.className) as DiagramLabel;
  for (const child of node.children) callerAliasOf.set(child, alias);
  return node.children;
}

// Explicit-stack (non-recursive) pre-order walk, bounded and cycle-safe via TreeWalk — see
// markdown-renderer.ts's renderTree (in @narrativetrace/core) for the full rationale.
export function renderInteractions(
  roots: readonly TraceNode[],
  aliases: Map<string, DiagramLabel>,
  grammar: SequenceGrammar,
): string[] {
  const lines: string[] = [];
  const callerAliasOf = new Map<TraceNode, DiagramLabel>();
  walkPreOrder(
    roots,
    (n) => childrenOf(n, aliases, callerAliasOf),
    (node, stop) => enterNode(node, stop, aliases, callerAliasOf, grammar, lines),
    (node) => exitNode(node, aliases, callerAliasOf, grammar, lines),
  );
  return lines;
}
