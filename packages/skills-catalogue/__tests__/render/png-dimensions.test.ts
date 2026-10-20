// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { pngDimensions } from "../../src/render/png-dimensions.js";
import { flatPng } from "../png-fixtures.js";

describe("pngDimensions", () => {
  it("reads width and height from a flat PNG", () => {
    expect(pngDimensions(flatPng(64, 32))).toEqual({ width: 64, height: 32 });
  });

  it("reads a dimension that needs all four IHDR bytes", () => {
    expect(pngDimensions(flatPng(256, 1))).toEqual({ width: 256, height: 1 });
  });

  it("rejects bytes too short to hold a signature and IHDR", () => {
    expect(() => pngDimensions(new Uint8Array(23))).toThrow(/too short/);
  });

  it("rejects exactly the shortest length that holds an IHDR when the signature is wrong", () => {
    expect(() => pngDimensions(new Uint8Array(24))).toThrow(/signature/);
  });

  it("rejects a near-miss signature that differs in its last byte", () => {
    const png = new Uint8Array(flatPng(64, 64));
    png[7] = 0x0b;
    expect(() => pngDimensions(png)).toThrow(/signature/);
  });

  it("rejects a PNG whose first chunk is not IHDR", () => {
    const png = new Uint8Array(flatPng(64, 64));
    png[12] = 0x58; // IHDR -> XHDR
    expect(() => pngDimensions(png)).toThrow(/IHDR/);
  });

  it("accepts the shortest valid input: signature plus a complete IHDR header", () => {
    expect(pngDimensions(flatPng(48, 48).subarray(0, 24))).toEqual({ width: 48, height: 48 });
  });
});
