// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  exportJson,
  methodSignature,
  returned,
  traceNode,
  traceTree,
} from "@narrativetrace/core-web";
import { describe, expect, it, vi } from "vitest";
import { postToCollector } from "../src/network-export.js";

function makeTree() {
  return traceTree([traceNode(methodSignature("Cart", "clear", []), returned(null), [])]);
}

const metadata = { scenario: "test scenario" } as const;

describe("postToCollector", () => {
  it("calls fetch with POST method and JSON content-type", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    await postToCollector(makeTree(), metadata, "https://collector.example.com/traces");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://collector.example.com/traces",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.unstubAllGlobals();
  });

  it("sends exportJson output as the request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    const tree = makeTree();
    await postToCollector(tree, metadata, "https://collector.example.com/traces");

    const expectedBody = exportJson(tree, metadata);
    const actualBody = mockFetch.mock.calls[0]?.[1]?.body;
    expect(actualBody).toBe(expectedBody);

    vi.unstubAllGlobals();
  });

  it("returns the fetch Response object", async () => {
    const expected = new Response("created", { status: 201 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(expected));

    const result = await postToCollector(
      makeTree(),
      metadata,
      "https://collector.example.com/traces",
    );

    expect(result).toBe(expected);

    vi.unstubAllGlobals();
  });

  it("propagates fetch errors on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      postToCollector(makeTree(), metadata, "https://collector.example.com/traces"),
    ).rejects.toThrow("Failed to fetch");

    vi.unstubAllGlobals();
  });
});
