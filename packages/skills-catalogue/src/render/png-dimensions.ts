// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const IHDR_TYPE = "IHDR";
const IHDR_TYPE_OFFSET = 12;
const WIDTH_OFFSET = 16;
const HEIGHT_OFFSET = 20;
const MIN_LENGTH = HEIGHT_OFFSET + 4;

/**
 * Reads a PNG's width and height straight out of its `IHDR` chunk — no imaging library, zero
 * dependencies. The OpenAI plugin package check uses it to verify the two listing icons are square
 * and at least 48 px without decoding a single pixel.
 *
 * Throws `Error` when `png` is shorter than a signature plus an `IHDR` header, does not start with
 * the PNG signature, or does not open with an `IHDR` chunk. Does not validate CRCs or pixel data.
 */
export function pngDimensions(png: Uint8Array): { width: number; height: number } {
  if (png.length < MIN_LENGTH) {
    throw new Error("not a PNG: too short to hold a signature and IHDR");
  }
  if (!SIGNATURE.every((byte, i) => png[i] === byte)) {
    throw new Error("not a PNG: bad signature");
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const type = String.fromCharCode(...png.subarray(IHDR_TYPE_OFFSET, IHDR_TYPE_OFFSET + 4));
  if (type !== IHDR_TYPE) {
    throw new Error("not a PNG: first chunk is not IHDR");
  }
  return { width: view.getUint32(WIDTH_OFFSET), height: view.getUint32(HEIGHT_OFFSET) };
}
