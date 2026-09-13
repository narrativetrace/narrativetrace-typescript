// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findGatedBytesInBinaryAssets, isBinaryAssetPath } from "../publish-binary-asset-scan.js";

// Standard PNG/zlib CRC-32 (ISO 3309 / ITU-T V.42, polynomial 0xEDB88320) — needed to build a
// PNG a real decoder (or exiftool) would also accept as valid, not just bytes this scanner
// happens to find. The scanner itself never parses chunks or checks a CRC; realism only.
function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** A minimal, genuinely valid 1x1 RGBA PNG, with an iTXt chunk carrying `metadataText` — the
 * shape a C2PA content-provenance record actually takes: plain ASCII/UTF-8 sitting inside an
 * otherwise binary container. */
function buildPngWithText(metadataText: string): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type: RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdr = pngChunk("IHDR", ihdrData);

  // iTXt: keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
  const itxtData = Buffer.concat([
    Buffer.from("XML:com.adobe.xmp", "latin1"),
    Buffer.from([0, 0, 0, 0, 0]),
    Buffer.from(metadataText, "utf-8"),
  ]);
  const itxt = pngChunk("iTXt", itxtData);

  const scanline = Buffer.concat([Buffer.from([0]), Buffer.from([10, 20, 30, 255])]);
  const idat = pngChunk("IDAT", deflateSync(scanline));

  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, itxt, idat, iend]);
}

describe("isBinaryAssetPath", () => {
  it("recognizes image, font, PDF and archive extensions, case-insensitively", () => {
    expect(isBinaryAssetPath("assets/icon.png")).toBe(true);
    expect(isBinaryAssetPath("assets/ICON.PNG")).toBe(true);
    expect(isBinaryAssetPath("fonts/glyphs.woff2")).toBe(true);
    expect(isBinaryAssetPath("docs/manual.pdf")).toBe(true);
    expect(isBinaryAssetPath("release/bundle.zip")).toBe(true);
  });

  it("does not treat ordinary source or doc files as binary assets", () => {
    expect(isBinaryAssetPath("src/index.ts")).toBe(false);
    expect(isBinaryAssetPath("README.md")).toBe(false);
    expect(isBinaryAssetPath("package.json")).toBe(false);
  });
});

describe("findGatedBytesInBinaryAssets", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "publish-binary-scan-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("catches a gated word embedded in a PNG's iTXt metadata chunk", () => {
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(
      join(root, "assets", "icon.png"),
      buildPngWithText('{"c2pa.manufacturer":"Anthropic"}'),
    );

    const hits = findGatedBytesInBinaryAssets(root, /claude|anthropic/i);

    expect(hits).toEqual(["assets/icon.png"]);
  });

  it("passes a clean PNG with no gated text in its metadata", () => {
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(join(root, "assets", "icon.png"), buildPngWithText("Created with GIMP"));

    const hits = findGatedBytesInBinaryAssets(root, /claude|anthropic/i);

    expect(hits).toEqual([]);
  });

  it("ignores non-asset files even when their content matches", () => {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "notes.ts"), "// written with claude");

    const hits = findGatedBytesInBinaryAssets(root, /claude|anthropic/i);

    expect(hits).toEqual([]);
  });

  it("reports paths relative to root, forward-slash separated, across subdirectories", () => {
    mkdirSync(join(root, "packages", "core", "assets"), { recursive: true });
    writeFileSync(
      join(root, "packages", "core", "assets", "banner.png"),
      buildPngWithText("Generated with Claude"),
    );

    const hits = findGatedBytesInBinaryAssets(root, /claude|anthropic/i);

    expect(hits).toEqual(["packages/core/assets/banner.png"]);
  });
});
