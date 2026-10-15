// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { expectedPlatformTableFiles } from "../platform-table-render.js";

const PAGE = "head\n<!-- platform-table:begin -->\nstale\n<!-- platform-table:end -->\ntail\n";
const PATH = "documentation/use-with-your-agent.md";

describe("expectedPlatformTableFiles", () => {
  const files = expectedPlatformTableFiles(() => PAGE);

  test("renders exactly the one page", () => {
    expect([...files.keys()]).toEqual([PATH]);
  });

  test("rewrites only the block between the markers", () => {
    const page = files.get(PATH) as string;
    expect(page.startsWith("head\n<!-- platform-table:begin -->\n| Platform |")).toBe(true);
    expect(page.endsWith("<!-- platform-table:end -->\ntail\n")).toBe(true);
    expect(page).not.toContain("stale");
  });

  test("reads the page at its repository path", () => {
    const asked: string[] = [];
    expectedPlatformTableFiles((path) => {
      asked.push(path);
      return PAGE;
    });
    expect(asked).toEqual([PATH]);
  });

  test("is idempotent: rendering a rendered page changes nothing", () => {
    const once = files.get(PATH) as string;
    expect(expectedPlatformTableFiles(() => once).get(PATH)).toBe(once);
  });
});
