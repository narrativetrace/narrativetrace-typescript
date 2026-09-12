// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * One `<!-- snippet: ... --> … <!-- /snippet -->` block found in an English documentation page —
 * the family-wide "docs as tests" convention, rule 8 (docs as tests). `path` is repo-root-relative,
 * matching every fenced block in the page: the marker names where the content actually lives, the
 * fence is only ever a rendering of it.
 */
export interface SnippetBlock {
  /** Doc page this block was found in, repo-root-relative. */
  readonly page: string;
  /** 1-based line number of the opening `<!-- snippet: ... -->` comment, for error messages. */
  readonly markerLine: number;
  /** Source file the block is embedded from, repo-root-relative. */
  readonly path: string;
  /** `region=NAME`, selecting a `// snippet:begin NAME` … `// snippet:end NAME` window; absent embeds the whole file. */
  readonly region: string | undefined;
  /** `mask=duration`, the only mask implemented so far (see the design note). */
  readonly mask: string | undefined;
  /** The fence's language tag, e.g. `js`, `text` — carried through unchanged by both check and sync. */
  readonly fenceLang: string;
  /** The fenced content exactly as it appears on the page today, one entry per line. */
  readonly contentLines: readonly string[];
  /** 0-based index into the page's lines of the first content line (for sync's in-place rewrite). */
  readonly contentStart: number;
  /** 0-based index into the page's lines one past the last content line. */
  readonly contentEnd: number;
}

const MARKER_OPEN = /^<!--\s*snippet:\s*(.+?)\s*-->$/;
const MARKER_CLOSE = /^<!--\s*\/snippet\s*-->$/;
const FENCE = /^```(\S*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;

/**
 * Splits `<!-- snippet: path region=NAME mask=duration -->`'s attribute text into the path and its
 * `key=value` attributes. The path is always the first whitespace-separated token; order of the
 * attributes after it does not matter.
 */
function parseAttributes(attrText: string): { path: string; region?: string; mask?: string } {
  const tokens = attrText.split(/\s+/).filter(Boolean);
  const path = tokens[0] ?? "";
  const attrs: Record<string, string> = {};
  for (const token of tokens.slice(1)) {
    const eq = token.indexOf("=");
    if (eq === -1) continue;
    attrs[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return { path, region: attrs.region, mask: attrs.mask };
}

/**
 * Every `<!-- snippet: ... --> … <!-- /snippet -->` block in `page`'s current text, in document
 * order.
 *
 * @throws {Error} naming `page` and the marker's line when a marker is not immediately (blank
 * lines aside) followed by a fenced code block and a matching `<!-- /snippet -->` — a malformed
 * marker is a bug in the page, not a drift `check`/`sync` can silently paper over.
 */
export function parseSnippetBlocks(page: string, text: string): SnippetBlock[] {
  const lines = text.split("\n");
  const blocks: SnippetBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const openMatch = MARKER_OPEN.exec(lines[i] as string);
    if (!openMatch) continue;
    const markerLine = i + 1;
    const { path, region, mask } = parseAttributes(openMatch[1] as string);

    let j = i + 1;
    while (j < lines.length && (lines[j] as string).trim() === "") j++;
    const fenceMatch = j < lines.length ? FENCE.exec(lines[j] as string) : null;
    if (!fenceMatch) {
      throw new Error(
        `${page}:${markerLine}: <!-- snippet: ${path} --> is not followed by a fenced code block`,
      );
    }
    const fenceLang = fenceMatch[1] ?? "";
    const contentStart = j + 1;
    let k = contentStart;
    while (k < lines.length && !FENCE_CLOSE.test(lines[k] as string)) k++;
    if (k >= lines.length) {
      throw new Error(
        `${page}:${markerLine}: <!-- snippet: ${path} -->'s fenced code block is never closed`,
      );
    }
    const contentEnd = k;

    let m = k + 1;
    while (m < lines.length && (lines[m] as string).trim() === "") m++;
    if (m >= lines.length || !MARKER_CLOSE.test(lines[m] as string)) {
      throw new Error(
        `${page}:${markerLine}: <!-- snippet: ${path} --> has no matching <!-- /snippet -->`,
      );
    }

    blocks.push({
      page,
      markerLine,
      path,
      region,
      mask,
      fenceLang,
      contentLines: lines.slice(contentStart, contentEnd),
      contentStart,
      contentEnd,
    });
    i = m;
  }

  return blocks;
}

/**
 * Whether `line` (already known to open with `prefix`, `//` or `#`) is itself one of the license
 * header's three lines — never a comment that merely happens to share the prefix, such as the
 * tutorial's own leading `// index.js`. Deliberately narrow: only a line naming the SPDX id, the
 * "Licensed under" sentence, or a copyright notice counts, so the run stops at the first ordinary
 * comment line and that line is left untouched.
 */
function isHeaderLine(line: string, prefix: "//" | "#"): boolean {
  const body = line.replace(new RegExp(`^\\s*${prefix === "//" ? "//" : "#"}\\s?`), "");
  return (
    /^SPDX-License-Identifier:/.test(body) ||
    /^Licensed under/.test(body) ||
    /^Copyright\b/i.test(body)
  );
}

/**
 * Strips the license header the publication step stamps into every staged source file at
 * publish time — a run of `//` or `#` comment lines (or a single `/* … *&#47;` block), always the
 * first thing in the file (a leading shebang line is preserved), whose text names an SPDX id or
 * "Licensed under". The single blank line that follows it, if any, goes with it. In-tree sources
 * never carry this header — `sync`/`check` compare against a public snapshot's stamped copy in
 * `--verify`, so this is the one place that difference is reconciled. Anything that is not the
 * header — including another leading comment, such as this tutorial's own `// index.js` — is left
 * exactly as it was; only the page side of a comparison is ever this untouched.
 */
export function stripLicenseHeader(source: string): string {
  const lines = source.split("\n");
  let offset = 0;
  if (/^#!/.test(lines[0] ?? "")) offset = 1;

  const first = lines[offset] ?? "";
  let end = offset;

  if (/^\s*\/\*/.test(first)) {
    while (end < lines.length && !/\*\//.test(lines[end] as string)) end++;
    if (end < lines.length) end++; // include the closing `*/` line
  } else {
    const prefix = /^\s*\/\//.test(first) ? "//" : /^\s*#/.test(first) ? "#" : null;
    if (prefix) {
      while (end < lines.length && isHeaderLine(lines[end] as string, prefix)) end++;
    }
  }

  if (end === offset) return source; // nothing that looks like a header at all
  const headerText = lines.slice(offset, end).join("\n");
  if (!/SPDX-License-Identifier|Licensed under/.test(headerText)) return source;

  let stripEnd = end;
  if ((lines[stripEnd] ?? undefined) !== undefined && (lines[stripEnd] as string).trim() === "") {
    stripEnd++;
  }

  return [...lines.slice(0, offset), ...lines.slice(stripEnd)].join("\n");
}

/** `— \d+(\.\d+)?ms` → `— Nms` on both sides of a comparison, so wall-clock timing never fails the check. */
function maskDuration(text: string): string {
  return text.replace(/—\s*\d+(\.\d+)?ms/g, "— Nms");
}

/**
 * Applies `mask` to `text` before a check/sync comparison. `undefined` is a no-op; `"duration"` is
 * the only mask implemented (design note: "and only that mask, for now") — anything else is a
 * marker typo, so it fails loudly rather than silently comparing unmasked text.
 */
export function applyMask(text: string, mask: string | undefined): string {
  if (mask === undefined) return text;
  if (mask === "duration") return maskDuration(text);
  throw new Error(`unsupported mask '${mask}' — only 'duration' is implemented`);
}

/**
 * The `// snippet:begin NAME` … `// snippet:end NAME` window inside `source` (line-comment syntax
 * only, the one this repo's own snippet sources need so far — see the design note's "idiomatic
 * comment syntax per language").
 *
 * @throws {Error} naming `path`/`region` when the begin/end pair is missing or out of order.
 */
export function extractRegion(source: string, region: string, path: string): string {
  const lines = source.split("\n");
  const begin = lines.findIndex((l) => l.trim() === `// snippet:begin ${region}`);
  const end = lines.findIndex((l) => l.trim() === `// snippet:end ${region}`);
  if (begin === -1 || end === -1 || end <= begin) {
    throw new Error(
      `${path}: region '${region}' not found (expected // snippet:begin ${region} … // snippet:end ${region})`,
    );
  }
  return lines.slice(begin + 1, end).join("\n");
}

/**
 * The real content a snippet block claims to embed — `block.path` in full, or its `region` window
 * — with a leading license header (see {@link stripLicenseHeader}) and exactly one trailing
 * newline stripped so it compares evenly against `contentLines.join` (a file read via
 * `readFileSync` ends in `\n`; a page's fenced block, split on `\n`, does not).
 *
 * @throws {Error} naming `block.path` when the file does not exist — a marker pointing at nothing
 * is a broken page, not a pass.
 */
export function resolveSnippetSource(block: SnippetBlock): string {
  if (!existsSync(block.path)) {
    throw new Error(
      `${block.page}:${block.markerLine}: snippet source '${block.path}' does not exist`,
    );
  }
  const raw = stripLicenseHeader(readFileSync(block.path, "utf-8"));
  const content = block.region
    ? extractRegion(raw, block.region, block.path)
    : raw.replace(/\n$/, "");
  return content;
}

/**
 * Every English documentation page: `documentation/*.md` directly, plus `documentation/llms.txt`
 * (the one non-Markdown page — an agent's first read, so its "copy this" block is held to the same
 * no-drift guarantee as everything else). Never a `documentation/<lang>/` mirror.
 */
export function englishDocPages(root = "documentation"): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter(
      (name) =>
        (name.endsWith(".md") || name === "llms.txt") && statSync(join(root, name)).isFile(),
    )
    .map((name) => join(root, name))
    .sort();
}
