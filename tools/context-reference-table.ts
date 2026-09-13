// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import ts from "typescript";

// Generates the "SyncNarrativeContext — full member reference" table embedded in
// documentation/llms-full.md between the `<!-- context-reference:begin -->` /
// `<!-- context-reference:end -->` markers (see tools/context-reference-render-cli.ts). The
// NarrativeContext interface section states only the small public subset every integration calls
// (owner ruling, 2026-09-13) — this table is the mechanical, AST-derived full surface, so it
// cannot drift from packages/core/src/context.ts the way a hand-typed list already had.

export const CONTEXT_SOURCE_PATH = "packages/core/src/context.ts";
const CLASS_NAME = "SyncNarrativeContext";

export interface ContextMemberRow {
  /** The member's own name, e.g. `enterMethod` or `isActive`. */
  readonly name: string;
  /** A one-line rendering of its declared shape — `get foo(): T`, `foo(a: A): B`, `readonly foo: T`. */
  readonly signature: string;
  /** The first line of its leading TSDoc comment, or `—` when it has none. */
  readonly summary: string;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === kind) ?? false;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `{@link Foo}` → `` `Foo` `` — the only TSDoc inline tag this class's own comments use, so this
 * is the one substitution the generated table needs to read as prose rather than raw markup. */
function renderInlineLinks(text: string): string {
  return text.replace(/\{@link\s+([^}\s]+)[^}]*}/g, "`$1`");
}

/** The first line of `node`'s leading `/** ... *&#47;` comment, or `—` when it has none.
 * `ts.getTextOfJSDocComment` resolves an inline `{@link Foo}` tag to `Foo` — the plain
 * concatenation `doc.comment` array walk it replaces would silently drop the tag's own text,
 * reading e.g. "How many times this context has been ." instead of "... been reset." */
function leadingSummary(node: ts.Node): string {
  for (const doc of ts.getJSDocCommentsAndTags(node)) {
    if (!ts.isJSDoc(doc) || !doc.comment) continue;
    const text = ts.getTextOfJSDocComment(doc.comment) ?? "";
    const firstLine = renderInlineLinks(oneLine(text.split("\n")[0] ?? ""));
    if (firstLine) return firstLine;
  }
  return "—";
}

function typeText(node: ts.TypeNode | undefined, sf: ts.SourceFile): string {
  return node ? oneLine(node.getText(sf)) : "void";
}

/** A one-line signature for a public property, get accessor, or method; `undefined` for anything
 * else (a constructor, a setter, an index signature — none appear on this class today). */
function memberSignature(member: ts.ClassElement, sf: ts.SourceFile): string | undefined {
  const readonlyPrefix = hasModifier(member, ts.SyntaxKind.ReadonlyKeyword) ? "readonly " : "";

  if (ts.isPropertyDeclaration(member)) {
    return oneLine(`${readonlyPrefix}${member.name.getText(sf)}: ${typeText(member.type, sf)}`);
  }
  if (ts.isGetAccessorDeclaration(member)) {
    return oneLine(`get ${member.name.getText(sf)}(): ${typeText(member.type, sf)}`);
  }
  if (ts.isMethodDeclaration(member)) {
    const typeParams = member.typeParameters?.length
      ? `<${member.typeParameters.map((tp) => oneLine(tp.getText(sf))).join(", ")}>`
      : "";
    const params = member.parameters.map((p) => oneLine(p.getText(sf))).join(", ");
    return oneLine(
      `${member.name.getText(sf)}${typeParams}(${params}): ${typeText(member.type, sf)}`,
    );
  }
  return undefined;
}

/**
 * Every public member `SyncNarrativeContext` declares in {@link CONTEXT_SOURCE_PATH}, in
 * declaration order — a `private`/`protected` member, the constructor, and a constructor
 * parameter property (declared in the constructor's parameter list, never a class body member)
 * are all excluded, mirroring what a consumer outside the module can actually see and call.
 */
export function syncNarrativeContextMembers(
  source: string = readFileSync(CONTEXT_SOURCE_PATH, "utf-8"),
): ContextMemberRow[] {
  const sf = ts.createSourceFile(CONTEXT_SOURCE_PATH, source, ts.ScriptTarget.Latest, true);
  const rows: ContextMemberRow[] = [];
  sf.forEachChild((node) => {
    if (!ts.isClassDeclaration(node) || node.name?.getText(sf) !== CLASS_NAME) return;
    for (const member of node.members) {
      if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) continue;
      if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) continue;
      const signature = memberSignature(member, sf);
      if (!signature) continue;
      const name = member.name && "getText" in member.name ? member.name.getText(sf) : "?";
      rows.push({ name, signature, summary: leadingSummary(member) });
    }
  });
  return rows;
}

/** Renders {@link syncNarrativeContextMembers} as a two-column Markdown table, one row per member. */
export function renderContextReferenceTable(
  members: readonly ContextMemberRow[] = syncNarrativeContextMembers(),
): string {
  const header = "| Member | Description |\n|---|---|";
  const rows = members.map((m) => `| \`${m.signature}\` | ${m.summary} |`);
  return [header, ...rows].join("\n");
}
