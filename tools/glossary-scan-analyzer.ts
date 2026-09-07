// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import ts from "typescript";
import {
  methodSignature,
  parameterCapture,
  returned,
  type TraceNode,
  type TraceTree,
  traceNode,
  traceTree,
} from "../packages/core/src/index.js";
import type { SourcePathLookup } from "../packages/glossary/src/index.js";

/** One method a scan found, with the vocabulary it declares. */
export interface ScannedMethod {
  readonly name: string;
  readonly parameters: readonly string[];
  /** Raw `@narrated` template text, placeholders intact, when the method declares one. */
  readonly narration?: string;
  /** Raw `@onError` template text, when the method declares one. */
  readonly errorContext?: string;
}

/** One class (or one module's standalone functions) a scan found, and where it lives. */
export interface ScannedClass {
  readonly className: string;
  readonly sourcePath: string;
  readonly methods: readonly ScannedMethod[];
}

function parameterNames(parameters: ts.NodeArray<ts.ParameterDeclaration>, file: ts.SourceFile) {
  return parameters.map((parameter) => parameter.name.getText(file));
}

/** Which scanned field each narration decorator fills. */
type TemplateField = "narration" | "errorContext";

/** The decorator names whose string argument is narration vocabulary. */
const TEMPLATE_DECORATORS = new Map<string, TemplateField>([
  ["narrated", "narration"],
  ["onError", "errorContext"],
]);

/**
 * The string literal a decorator call declares its template as, if it declares one at all.
 *
 * @remarks `@onError(SomeError, "template")` puts the template second, so the *last* argument is
 * read rather than the first. A non-literal argument yields `undefined`: its value exists only at
 * run time, and guessing would write a placeholder-free fragment into a committed file.
 */
function templateArgument(decorator: ts.Decorator): string | undefined {
  if (!ts.isCallExpression(decorator.expression)) return undefined;
  const last = decorator.expression.arguments.at(-1);
  return last !== undefined && ts.isStringLiteral(last) ? last.text : undefined;
}

function decoratorName(decorator: ts.Decorator, file: ts.SourceFile): string | undefined {
  const { expression } = decorator;
  return ts.isCallExpression(expression) ? expression.expression.getText(file) : undefined;
}

/** Reads every narration template a method declares; the first of a repeated kind wins. */
function templatesOf(
  member: ts.MethodDeclaration,
  file: ts.SourceFile,
): Partial<Record<TemplateField, string>> {
  const templates: Partial<Record<TemplateField, string>> = {};
  for (const decorator of ts.getDecorators(member) ?? []) {
    const name = decoratorName(decorator, file);
    const field = name === undefined ? undefined : TEMPLATE_DECORATORS.get(name);
    const template = templateArgument(decorator);
    if (field === undefined || template === undefined || templates[field] !== undefined) continue;
    templates[field] = template;
  }
  return templates;
}

function scanMethod(member: ts.MethodDeclaration, file: ts.SourceFile): ScannedMethod {
  return {
    name: member.name.getText(file),
    parameters: parameterNames(member.parameters, file),
    ...templatesOf(member, file),
  };
}

/**
 * Whether a method is part of the vocabulary a reader of this codebase would recognize.
 *
 * @remarks The Java reference skips synthetic, bridge and non-public methods; the platform
 * equivalents are the two spellings of privacy (`private`/`protected` modifiers and `#name`).
 * A constructor is not a {@link ts.MethodDeclaration} at all, so it never reaches here.
 */
function isPublicMethod(member: ts.MethodDeclaration): boolean {
  if (ts.isPrivateIdentifier(member.name)) return false;
  return !member.modifiers?.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
  );
}

function scanClass(declaration: ts.ClassDeclaration, file: ts.SourceFile): ScannedMethod[] {
  return declaration.members
    .filter((member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member))
    .filter(isPublicMethod)
    .map((member) => scanMethod(member, file));
}

/**
 * The stand-in class name for a file's module-level functions.
 *
 * INTENT: the platform's answer to a question Java never has to ask — a TypeScript module declares
 * domain actions with no class around them, and harvesting needs *some* name per file. The angle
 * brackets make it deliberately not an identifier, so the harvester's identifier filter keeps a
 * file name from ever becoming a domain term, while the per-file spelling is still what resolves
 * the module's bounded context.
 *
 * @remarks Two files sharing a base name in different directories collapse to one stand-in and are
 * therefore ambiguous — exactly how the Java reference treats a simple class name seen in two
 * packages. {@link sourcePathIndex} resolves that case to "unknown".
 */
function moduleName(sourcePath: string): string {
  const base = sourcePath.split(/[/\\]/).pop() ?? sourcePath;
  return `<${base.replace(/\.[cm]?[jt]sx?$/, "")}>`;
}

/** A module-level `function` or arrow-function const, which names a domain action with no class. */
function scanModuleFunction(node: ts.Node, file: ts.SourceFile): ScannedMethod | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return { name: node.name.getText(file), parameters: parameterNames(node.parameters, file) };
  }
  if (!ts.isVariableDeclaration(node) || node.initializer === undefined) return undefined;
  const { initializer } = node;
  if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) return undefined;
  return {
    name: node.name.getText(file),
    parameters: parameterNames(initializer.parameters, file),
  };
}

/**
 * Scans one source file into the classes and methods worth harvesting vocabulary from.
 *
 * INTENT: the static half of glossary harvesting (ADR-012 Phase 5). The Java reference reflects
 * over compiled classes; TypeScript has no equivalent at runtime, so this reads the syntax tree
 * instead — which is also what lets it see the **raw** `@narrated` / `@onError` template text
 * rather than one with parameter values already interpolated.
 *
 * @param sourceText the file's contents.
 * @param sourcePath the file's repository-relative path, which bounded contexts are declared by.
 * @returns one entry per class that declared at least one method; empty when the file declares no
 * harvestable vocabulary at all.
 * @example
 * ```ts
 * scanGlossarySource(readFileSync(file, "utf-8"), file);
 * ```
 */
export function scanGlossarySource(sourceText: string, sourcePath: string): ScannedClass[] {
  const file = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true);
  const scanned: ScannedClass[] = [];
  const moduleFunctions: ScannedMethod[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      const methods = scanClass(node, file);
      if (methods.length > 0) {
        scanned.push({ className: node.name.getText(file), sourcePath, methods });
      }
    }
    const fn = scanModuleFunction(node, file);
    if (fn !== undefined) moduleFunctions.push(fn);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (moduleFunctions.length > 0) {
    scanned.push({ className: moduleName(sourcePath), sourcePath, methods: moduleFunctions });
  }
  return scanned;
}

/** Sentinel for a class name declared in more than one file — resolved as unknown. */
const AMBIGUOUS = Symbol("ambiguous source path");

/**
 * Builds the class-name → source-path lookup the harvester resolves bounded contexts through.
 *
 * INTENT: the port of Java's `ClassPackageIndex`. A trace node carries only a bare class name, but
 * contexts are declared as path prefixes, so something has to supply the missing half; a scan of
 * the repository is the one place that knows the real file layout.
 *
 * @param classes everything a scan found, across every file.
 * @returns a lookup returning the declaring file's path, or `undefined` when the name was never
 * seen or was declared in more than one file — an ambiguous name files its vocabulary under
 * `_unassigned` rather than guessing a context it may not belong to.
 * @example
 * ```ts
 * harvestStatic(model, trees, sourcePathIndex(classes));
 * ```
 */
export function sourcePathIndex(classes: readonly ScannedClass[]): SourcePathLookup {
  const paths = new Map<string, string | typeof AMBIGUOUS>();
  for (const { className, sourcePath } of classes) {
    const seen = paths.get(className);
    if (seen === undefined) paths.set(className, sourcePath);
    else if (seen !== sourcePath) paths.set(className, AMBIGUOUS);
  }
  return (className) => {
    const path = paths.get(className);
    return typeof path === "string" ? path : undefined;
  };
}

/**
 * Builds the synthetic trace trees a static harvest walks.
 *
 * INTENT: the harvester's only input shape is a trace tree, so a scan has to present itself as
 * one. Nothing here was executed: every node is a root, carries no outcome worth reading, and its
 * parameters have names but no values.
 *
 * @param classes everything a scan found.
 * @returns one tree per class, its roots in declaration order; empty for an empty scan.
 * @example
 * ```ts
 * const trees = buildScannedTrees(classes);
 * ```
 */
export function buildScannedTrees(classes: readonly ScannedClass[]): TraceTree[] {
  return classes.map((scanned) =>
    traceTree(scanned.methods.map((method) => scannedNode(scanned.className, method))),
  );
}

function scannedNode(className: string, method: ScannedMethod): TraceNode {
  return traceNode(
    methodSignature(
      className,
      method.name,
      method.parameters.map((name) => parameterCapture(name, "", false)),
      {
        ...(method.narration !== undefined ? { narration: method.narration } : {}),
        ...(method.errorContext !== undefined ? { errorContext: method.errorContext } : {}),
      },
    ),
    returned(null),
    [],
  );
}

export type { SourcePathLookup };
