// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

// Binary-asset extensions a text grep with `-I` (used by the publish pipeline's trace/reference
// gates' content scans) always treats as "never matches" — images, PDFs, fonts, archives. A
// 2026-09-13 cross-port finding (dotnet) shipped exactly this gap: a NuGet package icon
// (assets/icon.png) carried an embedded C2PA content-provenance record naming the AI vendor in a
// PNG iTXt chunk — plain ASCII/UTF-8 sitting inside an otherwise binary container, invisible to
// any gate that only ever greps as text. Kept as a fixed extension list (not sniffed content) so
// the scan target is predictable and auditable, the same choice the pipeline's own
// `staged_source_files` already makes for the opposite direction.
const BINARY_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".bmp",
  ".tiff",
  ".svg",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".zip",
  ".jar",
  ".gz",
  ".tgz",
  ".tar",
  ".7z",
  ".rar",
]);

/** Whether `path` names a binary-asset type the trace/reference gates' text scans skip. */
export function isBinaryAssetPath(path: string): boolean {
  return BINARY_ASSET_EXTENSIONS.has(extname(path).toLowerCase());
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/**
 * Byte-scans every binary asset under `root` for `pattern`, case-insensitively, over the raw file
 * bytes decoded as latin1 (a lossless one-byte-per-code-point mapping that never throws on
 * arbitrary binary content — unlike UTF-8 decoding, which can corrupt or drop bytes around an
 * invalid sequence). An embedded ASCII/UTF-8 record — EXIF, XMP, PNG tEXt/iTXt/zTXt chunks and
 * C2PA provenance, PDF Info/XMP, a font `name` table, an archive comment — reads back as its
 * original bytes under latin1, so `pattern` still finds it regardless of what non-text bytes
 * surround it. This is the deliberate counterpart to `grep -I`, which the publish pipeline's
 * shell gates use for everything else and which is defined to skip binary content entirely.
 *
 * @returns paths (relative to `root`, forward-slash separated) whose content matched, in
 * directory-walk order.
 */
export function findGatedBytesInBinaryAssets(root: string, pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of listFiles(root)) {
    if (!isBinaryAssetPath(file)) continue;
    const bytes = readFileSync(file);
    const text = bytes.toString("latin1");
    // A fresh RegExp per file: a global-flag pattern carries `lastIndex` state across `.test()`
    // calls on the same instance, which would silently skip every other file's first match.
    const perFile = new RegExp(pattern.source, pattern.flags.includes("i") ? "i" : "");
    if (perFile.test(text)) hits.push(relative(root, file).split(sep).join("/"));
  }
  return hits;
}
