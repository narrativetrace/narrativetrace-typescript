// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import ts from "typescript";
import { analyzeClarity, type ClarityResult } from "../packages/clarity/src/index.js";
import {
  methodSignature,
  parameterCapture,
  returned,
  type TraceTree,
  traceNode,
  traceTree,
} from "../packages/core/src/index.js";

export interface MethodInfo {
  name: string;
  parameters: string[];
}

export interface ClassInfo {
  className: string;
  methods: MethodInfo[];
}

export function extractClasses(sourceText: string, fileName: string): ClassInfo[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const results: ClassInfo[] = [];

  function extractMembers(members: ts.NodeArray<ts.ClassElement | ts.TypeElement>): MethodInfo[] {
    const methods: MethodInfo[] = [];
    for (const member of members) {
      if (
        (ts.isMethodDeclaration(member) ||
          ts.isGetAccessorDeclaration(member) ||
          ts.isSetAccessorDeclaration(member) ||
          ts.isMethodSignature(member)) &&
        member.name
      ) {
        const name = member.name.getText(sourceFile);
        const parameters = member.parameters.map((p) => p.name.getText(sourceFile));
        methods.push({ name, parameters });
      }
    }
    return methods;
  }

  function extractParams(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): string[] {
    return node.parameters.map((p) => p.name.getText(sourceFile));
  }

  const standaloneMethods: MethodInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.getText(sourceFile);
      const methods = extractMembers(node.members);
      results.push({ className, methods });
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      const className = node.name.getText(sourceFile);
      const methods = extractMembers(node.members);
      if (methods.length > 0) {
        results.push({ className, methods });
      }
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      standaloneMethods.push({
        name: node.name.getText(sourceFile),
        parameters: extractParams(node),
      });
    } else if (
      ts.isVariableDeclaration(node) &&
      node.name &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      standaloneMethods.push({
        name: node.name.getText(sourceFile),
        parameters: extractParams(node.initializer),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (standaloneMethods.length > 0) {
    results.push({ className: "<module>", methods: standaloneMethods });
  }

  return results;
}

export function buildTraceTree(classes: ClassInfo[]): TraceTree {
  const nodes = classes.flatMap((cls) =>
    cls.methods.map((method) =>
      traceNode(
        methodSignature(
          cls.className,
          method.name,
          method.parameters.map((p) => parameterCapture(p, "", false)),
        ),
        returned(null),
        [],
      ),
    ),
  );
  return traceTree(nodes);
}

export interface ClassResult {
  className: string;
  result: ClarityResult;
}

export function scanSource(sourceText: string, fileName: string): ClassResult[] {
  const classes = extractClasses(sourceText, fileName);
  return classes.map((cls) => ({
    className: cls.className,
    result: analyzeClarity(buildTraceTree([cls])),
  }));
}
