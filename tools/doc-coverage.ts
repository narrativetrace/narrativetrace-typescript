// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Doc-coverage gate for TSDoc (see TSDOC.md). Reports the fraction of public exports carrying a
// leading TSDoc comment and fails when a gated package drops below its measured floor. `core` and
// `proxy` are gated because every integration builds on them.
interface Coverage {
  pkg: string;
  total: number;
  documented: number;
  pct: number;
  undocumented: string[];
}

function exportName(node: ts.Node, sf: ts.SourceFile): string {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations[0]?.name.getText(sf) ?? "?";
  }
  const named = node as { name?: ts.Node };
  return named.name?.getText(sf) ?? "?";
}

function isDocumentableExport(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  if (!isExported) return false;
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableStatement(node)
  );
}

/** Names re-exported from the package's `src/index.ts` — the true public API surface. */
function publicNames(pkg: string): Set<string> {
  const indexPath = `packages/${pkg}/src/index.ts`;
  const sf = ts.createSourceFile(
    indexPath,
    readFileSync(indexPath, "utf-8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set<string>();
  sf.forEachChild((node) => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) names.add(el.name.text);
    }
  });
  return names;
}

function coverage(pkg: string): Coverage {
  const publics = publicNames(pkg);
  const files = execSync(
    `find packages/${pkg}/src -name '*.ts' -not -name '*.test.ts' -not -name '*.prop.test.ts' -not -name '*.d.ts'`,
    { encoding: "utf-8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  let total = 0;
  let documented = 0;
  const undocumented: string[] = [];

  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf-8"), ts.ScriptTarget.Latest, true);
    sf.forEachChild((node) => {
      if (!isDocumentableExport(node)) return;
      const name = exportName(node, sf);
      // Only count symbols that are part of the package's public (index-re-exported) surface.
      if (!publics.has(name)) return;
      total++;
      const hasDoc = (ts.getJSDocCommentsAndTags(node) ?? []).length > 0;
      if (hasDoc) documented++;
      else undocumented.push(`${file}:${name}`);
    });
  }

  return {
    pkg,
    total,
    documented,
    pct: total ? Math.round((100 * documented) / total) : 100,
    undocumented,
  };
}

const GATED: Record<string, number> = { core: 90, proxy: 90 };
const verbose = process.argv.includes("--verbose");

let failed = false;
for (const pkg of Object.keys(GATED)) {
  const c = coverage(pkg);
  const floor = GATED[pkg] as number;
  const status = c.pct >= floor ? "OK" : "FAIL";
  console.log(
    `${status}  ${pkg}: ${c.documented}/${c.total} public exports documented (${c.pct}%, floor ${floor}%)`,
  );
  if (verbose || c.pct < floor) {
    for (const u of c.undocumented) console.log(`      undocumented: ${u}`);
  }
  if (c.pct < floor) failed = true;
}

if (failed) {
  console.error("\nDoc coverage below floor — add TSDoc to the exports above (see TSDOC.md).");
  process.exit(1);
}
