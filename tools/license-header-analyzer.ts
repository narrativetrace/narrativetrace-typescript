// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * In-tree source files carry **no** license header. The header is stamped by the publish
 * pipeline at publish time, so the licensing statement is written in exactly
 * one place and a relicensing decision cannot go stale across hundreds of files — which
 * is precisely what happened while the runtime moved from Apache 2.0 to BSL 1.1.
 *
 * These are the pure halves of that rule, so the CLI in `license-header.ts` stays a thin
 * file walker.
 */

/** Phrases that make a leading comment a license header rather than an ordinary one. */
const LICENSE_MARKERS = [
  "SPDX-License-Identifier",
  "Copyright 2026 Empower Agile",
  "Copyright (c) 2026 Empower Agile",
  "Licensed under the Apache License",
  "Licensed under the Business Source License",
];

const SHEBANG = /^#![^\n]*\n/;

function afterShebang(content: string): string {
  return content.replace(SHEBANG, "");
}

/** The leading comment of `body`, or `""` when it does not open with one. */
function leadingComment(body: string): string {
  if (body.startsWith("/*")) {
    const end = body.indexOf("*/");
    return end === -1 ? body : body.slice(0, end + 2);
  }
  const lines: string[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("//")) break;
    lines.push(line);
  }
  return lines.join("\n");
}

function isLicenseHeader(comment: string): boolean {
  return comment !== "" && LICENSE_MARKERS.some((marker) => comment.includes(marker));
}

/**
 * True when `content` opens with a license header — optionally after a shebang, as either
 * a `//` run or a `/* … *\/` block. License text quoted deeper in a file (a header tool's
 * own constants, a test fixture) is not a header and is left alone.
 */
export function hasInTreeHeader(content: string): boolean {
  return isLicenseHeader(leadingComment(afterShebang(content)));
}

/**
 * `content` without its leading license header and the single blank line that separated it
 * from the code. A shebang is preserved. Content without a header is returned unchanged, so
 * the function is idempotent and safe to run over a whole tree.
 */
export function stripInTreeHeader(content: string): string {
  const shebang = SHEBANG.exec(content)?.[0] ?? "";
  const body = content.slice(shebang.length);
  const comment = leadingComment(body);
  if (!isLicenseHeader(comment)) return content;
  return shebang + body.slice(comment.length).replace(/^\n\n?/, "");
}
