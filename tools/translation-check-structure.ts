// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { parseHeader, translatedFiles } from "./translation-check-discovery.js";

interface TableShape {
  readonly rows: number;
  readonly cols: number;
}

interface Profile {
  readonly headingLevels: number[];
  readonly codeBlocks: string[];
  readonly tables: TableShape[];
}

export interface StructureResult {
  readonly failures: string[];
  readonly warnings: string[];
}

const HEADING = /^(#{1,6})\s/;
const LINK_TARGET = /\[[^\]]*]\(([^)]+)\)/g;
const EXTERNAL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isFence(line: string): boolean {
  return line.trimStart().startsWith("```");
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.includes("-") && /^[|\-:\s]+$/.test(trimmed);
}

function headingLevels(lines: string[]): number[] {
  const levels: number[] = [];
  let inFence = false;
  for (const line of lines) {
    if (isFence(line)) inFence = !inFence;
    else if (!inFence) {
      const match = HEADING.exec(line);
      if (match) levels.push((match[1] as string).length);
    }
  }
  return levels;
}

function codeBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  let current: string[] | undefined;
  for (const line of lines) {
    if (isFence(line)) {
      if (current) blocks.push(current.join("\n"));
      current = current ? undefined : [];
      continue;
    }
    current?.push(line);
  }
  return blocks;
}

function flushTable(lines: string[], into: TableShape[]): void {
  if (lines.length < 2 || !isSeparatorRow(lines[1] as string)) return;
  const cols = (lines[0] as string).split("|").filter((c) => c.trim() !== "").length;
  into.push({ rows: lines.length - 2, cols });
}

function tableShapes(lines: string[]): TableShape[] {
  const tables: TableShape[] = [];
  let inFence = false;
  let current: string[] = [];
  for (const line of lines) {
    if (isFence(line)) {
      inFence = !inFence;
      flushTable(current, tables);
      current = [];
      continue;
    }
    if (!inFence && line.trimStart().startsWith("|")) current.push(line);
    else {
      flushTable(current, tables);
      current = [];
    }
  }
  flushTable(current, tables);
  return tables;
}

export function profileOf(text: string): Profile {
  const lines = text.split("\n");
  return {
    headingLevels: headingLevels(lines),
    codeBlocks: codeBlocks(lines),
    tables: tableShapes(lines),
  };
}

function stripFences(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .filter((line) => {
      if (isFence(line)) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join("\n");
}

/** Relative link targets in `text` (fenced code excluded) that do not resolve via `exists`. */
export function brokenLinks(
  text: string,
  translatedPath: string,
  exists: (path: string) => boolean,
): string[] {
  const dir = dirname(translatedPath);
  const failures: string[] = [];
  for (const match of stripFences(text).matchAll(LINK_TARGET)) {
    const target = (match[1] as string).split("#")[0]?.trim();
    if (!target || EXTERNAL_SCHEME.test(target)) continue;
    if (!exists(normalize(join(dir, target)))) {
      failures.push(`${translatedPath}: broken link to '${target}'`);
    }
  }
  return failures;
}

export function compareHeadings(source: number[], translated: number[], label: string): string[] {
  if (source.length !== translated.length) {
    return [
      `${label}: heading count differs — source has ${source.length}, translation has ${translated.length}`,
    ];
  }
  return source.flatMap((level, i) =>
    level !== translated[i]
      ? [
          `${label}: heading ${i + 1} level differs — source h${level}, translation h${translated[i]}`,
        ]
      : [],
  );
}

export function compareCodeBlockCounts(
  source: string[],
  translated: string[],
  label: string,
): string[] {
  return source.length === translated.length
    ? []
    : [
        `${label}: code block count differs — source has ${source.length}, translation has ${translated.length}`,
      ];
}

export function compareCodeBlockContent(
  source: string[],
  translated: string[],
  label: string,
): string[] {
  if (source.length !== translated.length) return [];
  return source.flatMap((block, i) =>
    block !== translated[i]
      ? [
          `${label}: code block ${i + 1} content differs from source (verify localized comments/placeholders by hand)`,
        ]
      : [],
  );
}

export function compareTables(
  source: TableShape[],
  translated: TableShape[],
  label: string,
): string[] {
  if (source.length !== translated.length) {
    return [
      `${label}: table count differs — source has ${source.length}, translation has ${translated.length}`,
    ];
  }
  return source.flatMap((t, i) => {
    const u = translated[i] as TableShape;
    return t.rows !== u.rows || t.cols !== u.cols
      ? [
          `${label}: table ${i + 1} shape differs — source ${t.rows}x${t.cols}, translation ${u.rows}x${u.cols}`,
        ]
      : [];
  });
}

function compareFile(path: string): StructureResult {
  const text = readFileSync(path, "utf-8");
  const header = parseHeader(text.split("\n")[0] ?? "");
  if (!header || !existsSync(header.sourcePath)) return { failures: [], warnings: [] };
  const source = profileOf(readFileSync(header.sourcePath, "utf-8"));
  const translated = profileOf(text);
  const failures = [
    ...compareHeadings(source.headingLevels, translated.headingLevels, path),
    ...compareCodeBlockCounts(source.codeBlocks, translated.codeBlocks, path),
    ...compareTables(source.tables, translated.tables, path),
    ...brokenLinks(text, path, existsSync),
  ];
  return {
    failures,
    warnings: compareCodeBlockContent(source.codeBlocks, translated.codeBlocks, path),
  };
}

/**
 * Structure parity between every translated file and its English source.
 *
 * @remarks Heading tree, code-block count, table shapes, and link resolution gate the build;
 * code-block *content* only ever warns — comments, `<placeholder>` labels, and per-language
 * example arguments are legitimately localized, and no dependency-free parser can tell that
 * apart from real drift (see the translation platform's conventions).
 */
export function checkAllStructure(): StructureResult {
  const results = translatedFiles().map(compareFile);
  return {
    failures: results.flatMap((r) => r.failures).sort(),
    warnings: results.flatMap((r) => r.warnings).sort(),
  };
}
