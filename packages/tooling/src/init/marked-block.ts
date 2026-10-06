// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The delimited section the installer owns inside a consumer's file, and every edit that section
 * can undergo.
 *
 * INTENT: one place decides what counts as a marker. Everything the installer writes into a file it
 * did not create lives between `<!-- narrativetrace:start … -->` and `<!-- narrativetrace:end -->`,
 * so a re-run replaces exactly that region and an uninstall removes exactly that region — the
 * property that makes both operations safe on a file somebody else owns.
 *
 * @llmNote The marker rule is narrow on purpose: a marker counts only when its line STARTS with the
 * marker text (column 0, no indentation) and the line is OUTSIDE a fenced code block. A document
 * that shows the markers in an example fence therefore keeps its own meaning, and this
 * repository's own `narrativetrace:skills:*` markers are not consumer markers — the prefix differs.
 *
 * @llmNote {@link appendToText} and {@link removeRegion} are inverses: appending separates the
 * block from what was there with exactly one blank line, and removing takes that blank line back.
 * The one thing an append cannot undo is the final newline it adds to a file that had none — a
 * block has to start on its own line.
 */

/** The opening marker, up to but not including the optional coordinate stamp. */
export const MARKER_START = "<!-- narrativetrace:start";

/** The closing marker, in full — it carries nothing. */
export const MARKER_END = "<!-- narrativetrace:end -->";

/**
 * Written as the first line of a file the installer CREATED, so an uninstall can tell a file it may
 * delete from one it merely appended to.
 */
export const CREATED_NOTE = "<!-- narrativetrace:created -->";

const BOM = "﻿";

/** One managed region inside a file. */
export interface MarkedRegion {
  /** Offset of the first character of the opening marker's line. */
  readonly start: number;
  /** Offset just past the closing marker's line, its terminator included. */
  readonly end: number;
  /** 1-based line of the opening marker, so a refusal can name it. */
  readonly startLine: number;
  /** The stamp on the opening marker, `""` when it carries none. */
  readonly coordinate: string;
}

/** One line of a file, with everything a marker decision needs. */
export interface MarkedLine {
  /** 1-based line number. */
  readonly number: number;
  /** Offset of the line's first character. */
  readonly start: number;
  /** Offset just past the line's terminator. */
  readonly end: number;
  /** The line without its terminator, and without a leading byte-order mark. */
  readonly content: string;
  /** Whether the line sits inside a fenced code block. */
  readonly inFence: boolean;
}

/**
 * What a scan found: every complete region, and every marker that cannot be part of one.
 *
 * @llmNote `problems` are human-readable and line-numbered. A caller REFUSES a file that has any,
 * rather than guessing which marker was meant.
 */
export interface MarkedScan {
  readonly regions: readonly MarkedRegion[];
  readonly problems: readonly string[];
}

/** Splits into lines that still carry their terminators, so offsets stay exact. */
export function splitKeepingTerminators(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const endExclusive = newline < 0 ? text.length : newline + 1;
    lines.push(text.slice(start, endExclusive));
    start = endExclusive;
  }
  return lines;
}

/** The line's content for MATCHING only: no terminator, and no byte-order mark on line 1. */
function contentOf(line: string, lineNumber: number): string {
  const withoutNewline = line.endsWith("\n") ? line.slice(0, -1) : line;
  const bare = withoutNewline.endsWith("\r") ? withoutNewline.slice(0, -1) : withoutNewline;
  return lineNumber === 1 && bare.startsWith(BOM) ? bare.slice(BOM.length) : bare;
}

/** A fenced-code delimiter, recognised at column 0 like every other marker here. */
function isFence(content: string): boolean {
  return content.startsWith("```") || content.startsWith("~~~");
}

/**
 * Splits a file into lines that know their offsets and whether they are inside a fence — the one
 * primitive both the marker scan and the import-line check read the file through.
 */
export function linesOf(text: string): MarkedLine[] {
  const lines: MarkedLine[] = [];
  let inFence = false;
  let offset = 0;
  for (const raw of splitKeepingTerminators(text)) {
    const line = markedLine(lines.length + 1, offset, raw, inFence);
    lines.push(line);
    if (isFence(line.content)) inFence = !inFence;
    offset += raw.length;
  }
  return lines;
}

/** One line, with the fence state it inherited from the line above folded in. */
function markedLine(number: number, start: number, raw: string, inFence: boolean): MarkedLine {
  const content = contentOf(raw, number);
  return { number, start, end: start + raw.length, content, inFence: inFence || isFence(content) };
}

/** The bare coordinate between the marker prefix and the comment's close. */
function coordinateIn(content: string): string {
  const rest = content.slice(MARKER_START.length);
  const close = rest.indexOf("-->");
  return close < 0 ? "" : rest.slice(0, close).trim();
}

/** The one piece of state a scan needs: the start marker that is still open. */
interface OpenMarker {
  readonly offset: number;
  readonly line: number;
  readonly coordinate: string;
}

function openMarker(scan: MutableScan, line: MarkedLine): void {
  if (scan.open) {
    scan.problems.push(
      `line ${line.number}: a narrativetrace:start marker inside the block opened at line ${scan.open.line}`,
    );
    return;
  }
  scan.open = { offset: line.start, line: line.number, coordinate: coordinateIn(line.content) };
}

function closeMarker(scan: MutableScan, line: MarkedLine): void {
  if (!scan.open) {
    scan.problems.push(`line ${line.number}: a narrativetrace:end marker with no start above it`);
    return;
  }
  scan.regions.push({
    start: scan.open.offset,
    end: line.end,
    startLine: scan.open.line,
    coordinate: scan.open.coordinate,
  });
  scan.open = undefined;
}

interface MutableScan {
  readonly regions: MarkedRegion[];
  readonly problems: string[];
  open: OpenMarker | undefined;
}

/** Finds every managed region in a file. Never throws: a malformed file is described, not read. */
export function scanMarkedBlocks(text: string): MarkedScan {
  const scan: MutableScan = { regions: [], problems: [], open: undefined };
  for (const line of linesOf(text)) {
    if (line.inFence) continue;
    if (line.content.startsWith(MARKER_START)) openMarker(scan, line);
    else if (line.content.startsWith(MARKER_END)) closeMarker(scan, line);
  }
  if (scan.open) {
    scan.problems.push(
      `line ${scan.open.line}: a narrativetrace:start marker with no end below it`,
    );
  }
  return { regions: scan.regions, problems: scan.problems };
}

/** True when the file carries exactly one well-formed region and nothing questionable. */
export function hasExactlyOneRegion(scan: MarkedScan): boolean {
  return scan.problems.length === 0 && scan.regions.length === 1;
}

/**
 * Whether the text ends with a fenced code block still open.
 *
 * @llmNote Load-bearing: anything appended to such a file lands INSIDE that fence, where neither
 * this scanner nor any Markdown reader will see it as a marker or an import — so the next run
 * appends again, and the run after that. Appending to one is refused, not attempted.
 */
export function endsInsideFence(text: string): boolean {
  return linesOf(text).filter((line) => isFence(line.content)).length % 2 === 1;
}

function firstLine(text: string, matches: (content: string) => boolean): MarkedLine | undefined {
  return linesOf(text).find((line) => !line.inFence && matches(line.content));
}

/** The first line outside a fence whose text is exactly this — what an uninstall removes. */
export function lineIs(text: string, wanted: string): MarkedLine | undefined {
  return firstLine(text, (content) => content === wanted);
}

/**
 * The first line outside a fence whose text, trailing whitespace ignored, is this — what an install
 * reads as "already there", because trailing spaces change nothing for a reader.
 */
export function lineIsIgnoringTrailingSpace(text: string, wanted: string): MarkedLine | undefined {
  return firstLine(text, (content) => content.trimEnd() === wanted);
}

/** Replaces one region with `block`, byte for byte everywhere else. */
export function replaceRegion(text: string, region: MarkedRegion, block: string): string {
  return text.slice(0, region.start) + block + text.slice(region.end);
}

/** The line ending a file uses, decided by its FIRST terminator; `\n` when it has none. */
export function eolOf(text: string): string {
  const newline = text.indexOf("\n");
  if (newline < 0) return "\n";
  return newline > 0 && text[newline - 1] === "\r" ? "\r\n" : "\n";
}

/** The same text with every line ending rewritten to `eol`. */
export function withEol(text: string, eol: string): string {
  return text.replaceAll("\r\n", "\n").replaceAll("\n", eol);
}

/**
 * Appends `block` to `text`, separated by exactly one blank line — nothing at all when the file is
 * empty. A file that did not end with a newline gets one: a block starts on its own line.
 */
export function appendToText(text: string, block: string): string {
  if (text === "") return block;
  const eol = eolOf(text);
  const head = text.endsWith("\n") || text.endsWith("\r") ? text : text + eol;
  return head + eol + block;
}

/** Removes the half-open range, and the single blank line {@link appendToText} would put before it. */
function cut(text: string, start: number, end: number): string {
  const eol = eolOf(text);
  const head = text.slice(0, start);
  const trimmed = head.endsWith(eol + eol) ? head.slice(0, -eol.length) : head;
  return trimmed + text.slice(end);
}

/** Removes one region and the single blank line {@link appendToText} would have put before it. */
export function removeRegion(text: string, region: MarkedRegion): string {
  return cut(text, region.start, region.end);
}

/** Removes one line and the single blank line {@link appendToText} would have put before it. */
export function removeLine(text: string, line: MarkedLine): string {
  return cut(text, line.start, line.end);
}
