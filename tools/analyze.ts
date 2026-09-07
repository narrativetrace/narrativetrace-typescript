// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import ts from "typescript";

export interface FunctionMetric {
  name: string;
  file: string;
  line: number;
  lines: number;
}

export function analyzeFile(sourceText: string, fileName: string): FunctionMetric[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const results: FunctionMetric[] = [];

  function addMetric(name: string, node: ts.Node): void {
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    results.push({
      name,
      file: fileName,
      line: startLine,
      lines: endLine - startLine + 1,
    });
  }

  function isNamedFunctionLike(
    node: ts.Node,
  ): node is (
    | ts.FunctionDeclaration
    | ts.MethodDeclaration
    | ts.GetAccessorDeclaration
    | ts.SetAccessorDeclaration
  ) & { name: ts.DeclarationName } {
    return (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      node.name !== undefined
    );
  }

  function isNamedFunctionVariable(
    node: ts.Node,
  ): node is ts.VariableDeclaration & { initializer: ts.Node } {
    return (
      ts.isVariableDeclaration(node) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    );
  }

  function visit(node: ts.Node): void {
    if (isNamedFunctionLike(node)) {
      addMetric(node.name.getText(sourceFile), node);
    } else if (
      ts.isFunctionDeclaration(node) &&
      !node.name &&
      node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword,
      )
    ) {
      addMetric("<default>", node);
    } else if (ts.isConstructorDeclaration(node)) {
      addMetric("constructor", node);
    } else if (isNamedFunctionVariable(node)) {
      addMetric(node.name.getText(sourceFile), node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}
