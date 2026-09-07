// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// @vitest-environment jsdom
import "@narrativetrace/core-web";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../client/App.js";

afterEach(cleanup);

describe("App", () => {
  test("renders heading and order form", () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    render(<App />);
    expect(screen.getByText("NestJS + React Trace Demo")).toBeDefined();
    expect(screen.getByRole("button", { name: "Place Order" })).toBeDefined();
    vi.restoreAllMocks();
  });
});
